import { StatementTypes } from "../../chef/javascript/components/statements/statement";
import { Expression, Operation, VariableReference } from "../../chef/javascript/components/value/expression";
import { ArgumentList } from "../../chef/javascript/components/constructs/function";
import { Value, Type, ValueTypes } from "../../chef/javascript/components/value/value";
import { replaceVariables, cloneAST, newOptionalVariableReference, newOptionalVariableReferenceFromChain, aliasVariables } from "../../chef/javascript/utils/variables";
import { getSlice, getElement, thisDataVariable } from "../helpers";
import { BindingAspect, IBinding, VariableReferenceArray, NodeData } from "../template";
import { HTMLElement, Node } from "../../chef/html/html";
import { ObjectLiteral } from "../../chef/javascript/components/value/object";
import { Component } from "../../component";

const valueParam = new VariableReference("value");

export function makeSetFromBinding(
    component: Component,
    binding: IBinding,
    nodeData: WeakMap<Node, NodeData>,
    variableChain: VariableReferenceArray,
    globals: Array<VariableReference> = []
): Array<StatementTypes> {
    const statements: Array<StatementTypes> = [];
    const elementStatement = binding.element ? getElement(binding.element, nodeData, component.templateElement) : null;
    const isElementNullable = binding.element ? nodeData.get(binding.element)?.nullable ?? false : false;

    // getSlice will return the trailing portion from the for iterator statement thing
    const variableReference = VariableReference.fromChain(...getSlice(variableChain) as Array<string>) as VariableReference;

    let newValue: ValueTypes | null = null;
    if (binding.expression) {
        const clonedExpression = cloneAST(binding.expression) as ValueTypes;
        
        replaceVariables(clonedExpression, valueParam, [variableReference]);
        aliasVariables(clonedExpression, thisDataVariable, [valueParam, ...globals]);
        newValue = clonedExpression;
    }

    switch (binding.aspect) {
        case BindingAspect.InnerText:
            // Gets the index of the fragment and alters the data property of the 
            // fragment (which exists on CharacterData) to the string value
            if (isElementNullable) {
                statements.push(new Expression({
                    lhs: new VariableReference("tryAssignData"),
                    operation: Operation.Call,
                    rhs: new ArgumentList([
                        newOptionalVariableReferenceFromChain(
                            elementStatement!,
                            "childNodes",
                            binding.fragmentIndex!,
                        ),
                        newValue!
                    ])
                }));
            } else {
                statements.push(new Expression({
                    lhs: VariableReference.fromChain(
                        elementStatement!,
                        "childNodes",
                        binding.fragmentIndex!,
                        "data"
                    ),
                    operation: Operation.Assign,
                    rhs: newValue!
                }));
            }
            break;
        case BindingAspect.Conditional: {
            const { clientRenderMethod, identifier } = nodeData.get(binding.element!) ?? {};

            const callConditionalSwapFunction = new Expression({
                lhs: VariableReference.fromChain("conditionalSwap", "call"),
                operation: Operation.Call,
                rhs: new ArgumentList([
                    new VariableReference("this"),
                    newValue!, // TODO temp non null
                    new Value(Type.string, identifier!),
                    VariableReference.fromChain("this", clientRenderMethod!.actualName!)
                ])
            });
            statements.push(callConditionalSwapFunction);
            break;
        }
        case BindingAspect.Iterator: {
            const clientRenderFunction = nodeData.get(binding.element!)!.clientRenderMethod!;

            const renderNewElement = new Expression({
                lhs: VariableReference.fromChain("this", clientRenderFunction.actualName!),
                operation: Operation.Call,
                rhs: new VariableReference("value")
            });

            const addNewElementToTheParent = new Expression({
                lhs: isElementNullable ?
                    newOptionalVariableReferenceFromChain(elementStatement!, "append") :
                    VariableReference.fromChain(elementStatement!, "append"),
                operation: isElementNullable ? Operation.OptionalCall : Operation.Call,
                rhs: renderNewElement
            });

            statements.push(addNewElementToTheParent);
            break;
        }
        case BindingAspect.Attribute:
            const attribute = binding.attribute!;
            if (HTMLElement.booleanAttributes.has(attribute)) {
                statements.push(new Expression({
                    lhs: new VariableReference(attribute, elementStatement!),
                    operation: Operation.Assign,
                    rhs: newValue!
                }));
            } else {
                const setAttributeRef = isElementNullable ? newOptionalVariableReference("setAttribute", elementStatement!) : new VariableReference("setAttribute", elementStatement!);
                statements.push(new Expression({
                    lhs: setAttributeRef,
                    operation: isElementNullable ? Operation.OptionalCall : Operation.Call,
                    rhs: new ArgumentList([
                        new Value(Type.string, attribute),
                        newValue!
                    ])
                }));
            }
            break;
        case BindingAspect.Data:
            if (isElementNullable) {
                statements.push(new Expression({
                    lhs: new VariableReference("tryAssignData"),
                    operation: Operation.Call,
                    rhs: new ArgumentList([
                        elementStatement!,
                        newValue!
                    ])
                }));
            } else {
                if (newValue! instanceof ObjectLiteral) {
                    // TODO only supports { x: y } or { x } atm (rhs has to be VariableReference)
                    // TODO rather than === valueParam should be has valueParam to parse expressions
                    const [property, value] = Array.from(newValue.values.entries())
                        .find(([_, val]) => val instanceof VariableReference && val.name === "value")!;

                    statements.push(
                        new Expression({ 
                            lhs: VariableReference.fromChain(elementStatement!, "data", property as string), 
                            operation: Operation.Assign, 
                            rhs: value
                        })
                    );
                } else {
                    statements.push(new Expression({
                        lhs: new VariableReference("data", elementStatement!),
                        operation: Operation.Assign,
                        rhs: newValue!
                    }));
                }
            }
            break;
        case BindingAspect.DocumentTitle:
            statements.push(new Expression({
                lhs: VariableReference.fromChain("document", "title"),
                operation: Operation.Assign,
                rhs: newValue!
            }));
            break;
        case BindingAspect.InnerHTML: {
            if (isElementNullable) {
                statements.push(new Expression({
                    lhs: new VariableReference("tryAssignData"),
                    operation: Operation.Call,
                    rhs: new ArgumentList([
                        elementStatement!,
                        newValue!,
                        new Value(Type.string, "innerHTML")
                    ])
                }));
            } else {
                statements.push(new Expression({
                    lhs: new VariableReference("innerHTML", elementStatement!),
                    operation: Operation.Assign,
                    rhs: newValue!
                }));
            }
            break;
        }
        case BindingAspect.Style:
            const styleObject = new VariableReference("style", elementStatement!);
            // Converts background-color -> backgroundColor which is the key JS uses
            const styleKey = binding.styleKey!.replace(/(?:-)([a-z])/g, (_, m) => m.toUpperCase());
            statements.push(new Expression({
                lhs: new VariableReference(styleKey, styleObject),
                operation: Operation.Assign,
                rhs: newValue!
            }));
            break;
        case BindingAspect.ServerParameter:
            const name = (binding.expression as VariableReference).name;
            const resetData = new Expression({
                lhs: VariableReference.fromChain("this", "_d"),
                operation: Operation.Assign,
                rhs: new ObjectLiteral(new Map([[name, new VariableReference("value")]]))
            });
            const removeDataProxy = new Expression({
                lhs: VariableReference.fromChain("this", "_pC"),
                operation: Operation.Delete
            });
            const clearElementCache = new Expression({
                lhs: VariableReference.fromChain("this", "_eC", "clear"),
                operation: Operation.Call
            });
            const renderCall = new Expression({
                lhs: VariableReference.fromChain("this", "render"),
                operation: Operation.Call,
            });
            statements.push(resetData, removeDataProxy, clearElementCache, renderCall);
            break;
        default:
            throw Error(`Unknown aspect ${BindingAspect[binding.aspect]}`)
    }

    return statements;
}

export function setLengthForIteratorBinding(binding: IBinding, nodeData: WeakMap<Node, NodeData>): StatementTypes {
    if (binding.aspect !== BindingAspect.Iterator) throw Error("Expected iterator binding");
    const getElemExpression = getElement(binding.element!, nodeData, null);

    // Uses the setLength helper to assist with sorting cache and removing from DOM
    return new Expression({
        lhs: new VariableReference("setLength"),
        operation: Operation.Call,
        rhs: new ArgumentList([
            getElemExpression,
            new VariableReference("value")
        ])
    });
}