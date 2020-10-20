import { TextNode, HTMLElement, Node } from "../chef/html/html";
import type { IValue } from "../chef/javascript/components/value/value";
import type { VariableReference } from "../chef/javascript/components/value/variable";
import type { ForLoopExpression, ForIteratorExpression } from "../chef/javascript/components/statements/for";
import { Component } from "../component";
import { parseHTMLElement } from "./html-element";
import { parseTextNode } from "./text-node";
import { FunctionDeclaration } from "../chef/javascript/components/constructs/function";

/**
 * Represents a event
 */
export interface IEvent {
    nodeIdentifier: string,
    element: HTMLElement,
    event: string,
    callback: VariableReference,
    required: boolean, // If required for logic to work, if true will be disabled on ssr,
    existsOnComponentClass: boolean, // True if the callback points to a method on the component class
}

/**
 * Extends the HTMLElement interface adding new properties used in Prism template syntax
 */
export interface NodeData {
    component?: Component // Whether the element is a external component
    dynamicAttributes?: Map<string, IValue> // Attributes of an element which are linked to data
    events?: Array<IEvent> // Events the element has
    identifier?: string // A identifier used for lookup of the element
    slotFor?: string // If slot the key of content that should be there
    nullable?: boolean // True if the element is not certain to exist in the DOM
    multiple?: boolean // If the element can exist multiple times in the DOM
    // elseElement?: PrismHTMLElement,
    // Client and server are aliased different
    clientExpression?: IValue | ForIteratorExpression,
    serverExpression?: IValue | ForIteratorExpression,
    clientRenderMethod?: FunctionDeclaration,

    conditionalRoot?: boolean, // If #if
    elseElement?: HTMLElement, // If #if points to the #else element
    iteratorRoot?: boolean, // If #for

    // For TextNodes:
    textNodeValue?: IValue; // A expression value for its text content
    // For HTMLComments:
    isFragment?: true // If the comment is used to break up text nodes for ssr hydration
}

// Explains what a variable affects
export enum BindingAspect {
    Attribute, // Affects a specific attribute of a node
    Data, // A components data
    InnerText, // Affects the inner text value of a node
    Iterator, // Affects the number of a children under a node / iterator
    Conditional, // Affects if a node is rendered TODO not visible but exists
    DocumentTitle, // Affects the document title
    SetHook, // Hook to method on a class
    Style // A css style
}

// Represents a link between data and a element
export interface IBinding {
    element: HTMLElement, // Used to see if the element is multiple or nullable
    expression: IValue | ForLoopExpression, // The expression that is the mutation of the variable
    aspect: BindingAspect, // The aspect the variable affects
    fragmentIndex?: number, // The index of the fragment to edit
    attribute?: string, // If aspect is a attribute then the name of the attribute
    styleKey?: string, // 
    referencesVariables: Array<VariableReferenceArray>,
}

export type PartialBinding = Omit<IBinding, 'referencesVariables'>;

export interface ForLoopVariable {
    aspect: "*",
    alias: string,
    origin: HTMLElement
}

export type VariableReferenceArray = Array<string | number | ForLoopVariable>;
export type Locals = Array<{ name: string, path: VariableReferenceArray }>;

export interface ITemplateData {
    slots: Map<string, HTMLElement>,
    nodeData: WeakMap<Node, Partial<NodeData>>
    bindings: Array<IBinding>,
    events: Array<IEvent>,
    hasSVG: boolean
}

export interface ITemplateConfig {
    ssrEnabled: boolean,
    importedComponents: Map<string, Component>,
    doClientSideRouting: boolean
}

/**
 * Parse the <template> element and its children. TODO explain
 * @param templateElement A root <template> element
 * @param component The component that the template exists under
 */
export function parseTemplate(
    templateElement: HTMLElement,
    templateConfig: ITemplateConfig,
    locals: Array<VariableReference> = [],
): ITemplateData {
    if (templateElement.tagName !== "template") {
        throw Error("Element must be of tag name template");
    }

    const templateData: ITemplateData = {
        slots: new Map(),
        bindings: [],
        events: [],
        nodeData: new WeakMap(),
        hasSVG: false
    }

    for (const child of templateElement.children) {
        parseNode(child, templateData, templateConfig, locals);
    }

    return templateData;
}

/**
 * Mutates all elements:
 * - Adds event listeners to nodes with event binding attributes
 * - Splits up text node with multiple variables to assist with ssr extraction
 */
export function parseNode(
    element: Node,
    templateData: ITemplateData,
    templateConfig: ITemplateConfig,
    locals: Array<VariableReference>, // TODO eventually remove
    localData: Locals = [],
    nullable = false,
    multiple = false,
): void {
    if (element instanceof HTMLElement) {
        parseHTMLElement(element, templateData, templateConfig, locals, localData, nullable, multiple);
    } else if (element instanceof TextNode) {
        parseTextNode(element, templateData, templateConfig, locals, localData, multiple);
    }
}