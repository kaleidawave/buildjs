import { HTMLElement, TextNode, HTMLComment, Node } from "../../chef/html/html";
import { Expression, Operation, VariableReference } from "../../chef/javascript/components/value/expression";
import { Value, ValueTypes, Type } from "../../chef/javascript/components/value/value";
import { FunctionDeclaration, ArgumentList } from "../../chef/javascript/components/constructs/function";
import { ObjectLiteral } from "../../chef/javascript/components/value/object";
import { cloneAST, aliasVariables } from "../../chef/javascript/utils/variables";
import { ForIteratorExpression } from "../../chef/javascript/components/statements/for";
import { ReturnStatement } from "../../chef/javascript/components/statements/statement";
import { thisDataVariable } from "../helpers";
import { NodeData } from "../template";

/**
 * Adds render method to existing class component definition
 * @param template The <template> element from the Prism
 * @param aliasDataToThis given data variables point them towards this 
 * TODO settings object
 */
export function buildClientRenderMethod(
    template: HTMLElement,
    nodeData: WeakMap<Node, NodeData>,
    aliasDataToThis: boolean,
    shadowDOM: boolean = false,
    locals: Array<VariableReference> = []
): FunctionDeclaration {
    if (template instanceof HTMLComment) throw Error();

    const args: Array<ValueTypes> = [];
    for (const child of template.children) {
        const clientChildRendered = clientRenderPrismNode(child, nodeData, aliasDataToThis, locals);
        if (clientChildRendered === null) continue;
        args.push(clientChildRendered);
    }

    const attachTo = shadowDOM ?
        new Expression({
            lhs: VariableReference.fromChain("this", "attachShadow"),
            operation: Operation.Call,
            rhs: new ObjectLiteral(new Map([["mode", new Value(Type.string, "open")]]))
        })
        // super used to prevent collision with slot catching
        : new VariableReference("super");
    return new FunctionDeclaration(
        "render",
        [],
        [
            new Expression({
                lhs: new VariableReference("append", attachTo),
                operation: Operation.Call,
                rhs: new ArgumentList(args)
            }),
        ]
    );
}

/**
 * Generated the call for rendering a node (element, text node or comment)
 * If not needed will return null (TODO temp element should not exist at all)
 */
export function clientRenderPrismNode(
    element: Node,
    nodeData: WeakMap<Node, NodeData>,
    aliasDataToThis: boolean = false,
    locals: Array<VariableReference> = [],
    skipOverClientExpression: boolean = false
): ValueTypes {
    if (element instanceof HTMLElement) {
        // If slot then use then loaded slotted element
        if (element.tagName === "slot") {
            return new Expression({
                operation: Operation.Spread,
                lhs: VariableReference.fromChain("this", "slotElement")
            });
        }

        // Pointer to the h minified render function included in prism bundle under `render.ts`
        const renderFunction = new VariableReference("h");

        const elementData = nodeData.get(element);

        // The render function (h) second argument takes 0 (falsy) if no attributes, string for a single class name and a object literal of attribute to value pairs. Mostly for minification purposes
        const attrs: Array<[string, ValueTypes]> = [];
        if (element.attributes) {
            for (const [name, value] of element.attributes) {
                if (HTMLElement.booleanAttributes.has(name)) {
                    attrs.push([name, new Value(Type.boolean, "true")])
                } else {
                    attrs.push([name, new Value(Type.string, value ?? "")])
                }
            }
        }

        if (elementData?.dynamicAttributes) {
            for (const [key, value] of elementData?.dynamicAttributes) {
                if (aliasDataToThis) {
                    // Value reference is also used a lot so due to aliasVariables doing it in place best to clone it to prevent side effects
                    const clonedValue = cloneAST(value);
                    aliasVariables(clonedValue, thisDataVariable, locals);
                    attrs.push([key, clonedValue]);
                } else {
                    attrs.push([key, value]);
                }
            }
        }

        let eventArgument: ValueTypes;
        if (elementData?.events) {
            // TODO abstract
            eventArgument = new ObjectLiteral(
                new Map(
                    elementData?.events.map(event => {
                        let callback: ValueTypes;
                        if (event.existsOnComponentClass) {
                            callback = new Expression({
                                lhs: VariableReference.fromChain("this", event.callback.name, "bind"),
                                operation: Operation.Call,
                                rhs: new ArgumentList([new VariableReference("this")])
                            });
                        } else {
                            callback = event.callback;
                        }
                        return [event.eventName, callback];
                    })
                )
            );
        } else {
            eventArgument = new Value(Type.number, 0);
        }

        // TODO explain
        let childrenArgument: Array<ValueTypes>;
        if ((elementData?.conditionalExpression || elementData?.iteratorExpression) && !skipOverClientExpression) {
            if (elementData.clientRenderMethod) {
                if (elementData.iteratorExpression) {
                    const clientExpression = cloneAST(elementData.iteratorExpression) as ForIteratorExpression;
                    aliasVariables(clientExpression, thisDataVariable, locals);
                    childrenArgument = [
                        new Expression({
                            operation: Operation.Spread,
                            lhs: new Expression({
                                lhs: new VariableReference("map", clientExpression.subject),
                                operation: Operation.Call,
                                rhs: VariableReference.fromChain("this", elementData.clientRenderMethod.actualName!)
                            })
                        })
                    ];
                } else {
                    return new Expression({
                        lhs: VariableReference.fromChain("this", elementData.clientRenderMethod.actualName!),
                        operation: Operation.Call,
                    });
                }
            } else {
                // Produce a map expression:
                // *subject*.map(*variable* => *clientRenderChildren*)
                if (elementData.iteratorExpression) {
                    const clientExpression = cloneAST(elementData.iteratorExpression);
                    aliasVariables(clientExpression, thisDataVariable, locals);
                    childrenArgument = [
                        new Expression({
                            operation: Operation.Spread,
                            lhs: new Expression({
                                lhs: new VariableReference("map", clientExpression.subject),
                                operation: Operation.Call,
                                rhs: new FunctionDeclaration(
                                    null,
                                    [clientExpression.variable],
                                    [new ReturnStatement(
                                        clientRenderPrismNode(element.children[0], nodeData, aliasDataToThis, locals)
                                    )],
                                    { bound: false }
                                )
                            })
                        })
                    ];
                }
                // Produce a ternary expression:
                // *conditionExpression* ? *renderTruthyNode* : *renderFalsyChild*
                else {
                    const renderTruthyChild = clientRenderPrismNode(element, nodeData, aliasDataToThis, locals, true);
                    const { elseElement, conditionalExpression } = nodeData.get(element)!;
                    const renderFalsyChild = clientRenderPrismNode(elseElement!, nodeData, aliasDataToThis, locals);

                    const clientConditionExpression = cloneAST(conditionalExpression!);
                    aliasVariables(clientConditionExpression, thisDataVariable, locals);

                    return new Expression({
                        lhs: clientConditionExpression as ValueTypes,
                        operation: Operation.Ternary,
                        rhs: new ArgumentList([
                            renderTruthyChild,
                            renderFalsyChild
                        ])
                    })
                }
            }
        } else if (elementData?.rawInnerHTML) {
            const aliasedRawInnerHTMLValue = cloneAST(elementData.rawInnerHTML);
            aliasVariables(aliasedRawInnerHTMLValue, thisDataVariable, locals);
            attrs.push(["innerHTML", aliasedRawInnerHTMLValue]);
            childrenArgument = [];
        } else {
            // TODO explain including case where children.length === 0
            childrenArgument =
                element.children.map(element => clientRenderPrismNode(element, nodeData, aliasDataToThis, locals))
        }


        const attributeArgument: ValueTypes = attrs.length > 0 ?
            new ObjectLiteral(new Map(attrs)) :
            new Value(Type.number, 0); // 0 is used as a falsy value

        // TODO trim trailing 0's

        // Arguments for: h(tagname: string, attribute: 0 | string | object, events: 0 | object, ...children: Array<string>)
        const argumentList = new ArgumentList([
            new Value(Type.string, element.tagName),
            attributeArgument,
            eventArgument,
            ...childrenArgument
        ]);

        return new Expression({
            lhs: renderFunction,
            operation: Operation.Call,
            rhs: argumentList
        });

    } else if (element instanceof TextNode) {
        const textNodeValue = nodeData.get(element)?.textNodeValue;
        if (textNodeValue && aliasDataToThis) {
            const clonedValue = cloneAST(textNodeValue);
            aliasVariables(clonedValue, thisDataVariable, locals);
            return clonedValue;
        } else {
            // Expand out html symbols
            const value = element.text.replace(/&#(x)?(.*?);/g, (_, x, v) => {
                // If hexadecimal
                if (x) {
                    return "\\u" + v.padStart(4, "0");
                } else {
                    return "\\u" + parseInt(v).toString(16).padStart(4, "0");
                }
            });
            return new Value(Type.string, value);
        }
    } else if (element instanceof HTMLComment) {
        const isFragment = nodeData.get(element)?.isFragment;
        if (!isFragment) throw Error("Client side rendering of non-fragment comment supported");
        // This used to maintain the same structure as server rendered content
        return new Expression({
            lhs: new VariableReference("cC"), // Create comment function in render.ts
            operation: Operation.Call,
            rhs: element.comment ? new Value(Type.string, element.comment) : new ArgumentList
        });
    } else {
        throw Error(`Unsupported building of ${element!.constructor.name}`)
    }
}