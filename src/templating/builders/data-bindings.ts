import { FunctionDeclaration } from "../../chef/javascript/components/constructs/function";
import { ObjectLiteral } from "../../chef/javascript/components/value/object";
import { ReturnStatement, StatementTypes } from "../../chef/javascript/components/statements/statement";
import { ValueTypes, Value, Type } from "../../chef/javascript/components/value/value";
import { IBinding, BindingAspect, VariableReferenceArray, ForLoopVariable, NodeData } from "../template";
import { makeGetFromBinding, getLengthFromIteratorBinding } from "./get-value";
import { makeSetFromBinding, setLengthForIteratorBinding } from "./set-value";
import { getTypeFromVariableReferenceArray } from "../helpers";
import { IType } from "../../chef/javascript/utils/types";
import { Expression, Operation, VariableReference } from "../../chef/javascript/components/value/expression";
import { Node } from "../../chef/html/html";
import { IFinalPrismSettings } from "../../settings";

/** Represents a data point */
interface IDataPoint {
    variable: VariableReferenceArray, // The variable it references
    type: IType, // The type of variable
    isExternal: boolean | null, // null represents not set
    getReturnValueNullable?: boolean,
    getReturnValue: ValueTypes | null,
    setStatements: Array<StatementTypes>,
    pushStatements?: Array<StatementTypes>
}

/**
 * Creates the object literal structure that runtime observables use
 */
export function constructBindings(
    bindings: Array<IBinding>,
    nodeData: WeakMap<Node, NodeData>,
    variableType: IType,
    globals: Array<VariableReference>,
    settings: IFinalPrismSettings
): ObjectLiteral {
    const tree = new ObjectLiteral();
    const dataMap: Array<IDataPoint> = [];

    for (const binding of bindings) {
        for (const variableChain of binding.referencesVariables) {
            // TODO diff dataMap with used variables as to not compile bindings for data that isn't used AND do this before creating bindings
            const type = getTypeFromVariableReferenceArray(variableChain, variableType);

            let dataPoint = findDataPoint(dataMap, variableChain);

            if (dataPoint === null) {
                dataPoint = {
                    variable: variableChain,
                    getReturnValue: null,
                    setStatements: [],
                    type,
                    isExternal: null
                }

                dataMap.push(dataPoint);
            }

            // TODO if binding.aspect === ValueTypes.data or binding.aspect === ValueTypes.reference add some data to the tree so the runtime observable can do stuff

            // Add getters and setters for length of the array
            if (binding.aspect === BindingAspect.Iterator) {
                const lengthVariableChain = [...variableChain, "length"];
                let lengthDataPoint = findDataPoint(dataMap, lengthVariableChain);

                if (!lengthDataPoint) {
                    lengthDataPoint = {
                        variable: lengthVariableChain,
                        getReturnValue: null,
                        setStatements: [],
                        type: { name: "number" }, // TODO temp length === number
                        isExternal: null
                    }

                    dataMap.push(lengthDataPoint);
                }

                if (!lengthDataPoint.getReturnValue && settings.context === "isomorphic") {
                    lengthDataPoint.getReturnValue = getLengthFromIteratorBinding(binding, nodeData)
                }

                lengthDataPoint.setStatements.push(setLengthForIteratorBinding(binding, nodeData));
            }

            const isomorphicContext = settings.context === "isomorphic";
            const isReversibleBinding = binding.aspect !== BindingAspect.Iterator;
            const buildReverseBinding = !dataPoint.getReturnValue || dataPoint.getReturnValueNullable === true;

            if (
                (isomorphicContext && isReversibleBinding && buildReverseBinding) || binding.aspect === BindingAspect.Data) {
                try {
                    const getValue = makeGetFromBinding(binding, nodeData, type, variableChain, settings);
                    if (getValue !== null) {
                        if (dataPoint.getReturnValueNullable !== true) {
                            dataPoint.getReturnValue = getValue;
                        } else {
                            dataPoint.getReturnValue = new Expression({
                                lhs: dataPoint.getReturnValue!, 
                                operation: Operation.NullCoalescing, 
                                rhs: getValue
                            });
                        }
                        dataPoint.getReturnValueNullable = binding.element ? 
                            nodeData.get(binding.element)?.nullable ?? false : false;
                    }
                } catch (er) {
                    // TODO some expr will fail which is okay but  
                }
            }

            const setStatement = makeSetFromBinding(binding, nodeData, variableChain, globals);

            if (binding.aspect === BindingAspect.Iterator) {
                if (!dataPoint.pushStatements) dataPoint.pushStatements = [];
                dataPoint.pushStatements.push(...setStatement);
            } else {
                dataPoint.setStatements.push(...setStatement);
            }

            if (binding.aspect === BindingAspect.Data && dataPoint.isExternal === null) {
                dataPoint.isExternal = true;
            }
        }
    }

    if (settings.context === "isomorphic") {
        // Check that each variable has a get binding
        for (const dataPoint of dataMap) {
            if (!dataPoint.getReturnValue) {
                // TODO temp
                // throw Error(`Could not find a point in which ${dataPoint.variable.render()} could be retrieved from SSR`)
            }
        }
    }

    for (const point of dataMap) {
        generateBranch(point, tree);
    }

    return tree;
}

// Types that don't need to be compiled into the tree
const ignoredTypes = new Set(["number", "string", "boolean"]);

function generateBranch(
    point: IDataPoint,
    tree: ObjectLiteral
): void {
    // Retrieve branch related to variableBinding
    let variableContainer: ObjectLiteral = tree;

    const positionalArgs: Array<string> = [];

    // Get or generate a branch on a object literal
    // Walks through object literal and will use branch if exists
    for (const part of point.variable) {
        // (If part is object it introduced a index)
        // Set the positional arguments (x->y->z)
        if (typeof part === "object") positionalArgs.push(String.fromCharCode(positionalArgs.length + 120));

        // TODO not implemented reacting to someArray[5]
        if (typeof part === "number") throw Error("Not implemented - number");

        let objectLiteralName = typeof part === "string" ? part : part.aspect;

        if (variableContainer.values.has(objectLiteralName)) {
            variableContainer = variableContainer.values.get(objectLiteralName) as ObjectLiteral;
        } else {
            const subTree = new ObjectLiteral;
            // Set the type
            subTree.values.set("type", new Value(Type.object));
            variableContainer.values.set(objectLiteralName, subTree);
            variableContainer = subTree;
        }
    }

    if (point.getReturnValue) {
        const returnStatement = new ReturnStatement(point.getReturnValue);
        const getFunc = new FunctionDeclaration("get", positionalArgs, [returnStatement], { parent: variableContainer, bound: true });
        variableContainer.values.set("get", getFunc);
    }

    if (point.pushStatements) {
        const pushFunc = new FunctionDeclaration("push", ["value", ...positionalArgs.slice(0, positionalArgs.length - 1)], point.pushStatements, { parent: variableContainer, bound: true });
        variableContainer.values.set("push", pushFunc);
    }

    if (point.setStatements.length > 0) {
        const setFunc = new FunctionDeclaration("set", ["value", ...positionalArgs], point.setStatements, { parent: variableContainer, bound: true });
        variableContainer.values.set("set", setFunc);
    }

    if (point.type) {
        if (ignoredTypes.has(point.type.name!)) {
            // TODO temp for get rid of type: "object"
            variableContainer.values.delete("type");
        } else {
            // TODO point.type.name ?? "object"
            variableContainer.values.set("type", new Value(Type.string, point.type.name ?? "object"));
        }
    }
}

/**
 * Returns the right most `IDataPoint` given a `VariableReferenceArray`
 */
function findDataPoint(points: Array<IDataPoint>, variableChain: VariableReferenceArray): IDataPoint | null {
    return points.find(point =>
        point.variable.length === variableChain.length
        && point.variable.every(
            (v, i) =>
                typeof v === "object" ?
                    v.aspect === (variableChain[i] as ForLoopVariable)?.alias :
                    v === variableChain[i]
        )
    ) ?? null;
}