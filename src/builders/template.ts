import { IFinalPrismSettings } from "../settings";
import { flatElements, HTMLDocument, HTMLElement, Node } from "../chef/html/html";
import { fileBundle } from "../bundled-files";
import { NodeData } from "../templating/template";
import { assignToObjectMap } from "../helpers";
import { IRenderSettings } from "../chef/helpers";
import { join } from "../filesystem";

export interface IShellData {
    document: HTMLDocument,
    nodeData: WeakMap<Node, NodeData>
    slots: Set<HTMLElement>
}

/**
 * Creates the underlining index document including references in the script to the script and style bundle.
 */
export function parseTemplateShell(settings: IFinalPrismSettings, jsName: string, cssName: string): IShellData {
    // Read the included template or one specified by settings
    let document: HTMLDocument;
    const nodeData: WeakMap<Node, NodeData> = new WeakMap(),
        slots: Set<HTMLElement> = new Set();
    if (settings.absoluteTemplatePath) {
        document = HTMLDocument.fromFile(settings.absoluteTemplatePath);
    } else {
        document = HTMLDocument.fromString(fileBundle.get("template.html")!, "template.html");
    }

    for (const element of flatElements(document)) {
        if (element.tagName === "slot") {
            const slotFor = element.attributes?.get("for") ?? "content";

            slots.add(element);
            assignToObjectMap(nodeData, element, "slotFor", slotFor);

            switch (slotFor) {
                case "content":
                    // Wrap slot inside out router-component:
                    let swapElement: HTMLElement = new HTMLElement("router-component", null, [], element.parent);
                    element.parent!.children.splice(element.parent!.children.indexOf(element), 1, swapElement);
                    swapElement.children.push(element);
                    element.parent = swapElement;
                    break;
                case "meta":
                    // TODO manifest
                    element.parent!.children.splice(
                        element.parent!.children.indexOf(element),
                        0,
                        new HTMLElement(
                            "script",
                            new Map([["type", "module"], ["src", settings.relativeBasePath + jsName]]),
                            [],
                            element.parent
                        ),
                        new HTMLElement(
                            "link",
                            new Map([["rel", "stylesheet"], ["href", settings.relativeBasePath + cssName]]),
                            [],
                            element.parent
                        )
                    );
                    break;
                default:
                    throw Error(`Unknown value for slot for. Expected "content" or "meta" received "${slotFor}"`);
            }
        }
    }

    return { document, nodeData, slots };
}

/**
  Writes out a "index.html" or "shell.html" which is for using Prism as a csr spa
*/
export function writeIndexHTML(
    template: IShellData,
    settings: IFinalPrismSettings,
    clientRenderSettings: Partial<IRenderSettings>
) {
    const indexHTMLPath =
        join(settings.absoluteOutputPath, settings.context === "client" ? "index.html" : "shell.html");

    // Remove slot elements from the output
    const slotElements: Array<[HTMLElement | HTMLDocument, HTMLElement, number]> = [];
    for (const slotElem of template.slots) {
        const parent = slotElem.parent!;
        const indexOfSlotElement = parent.children.indexOf(slotElem);
        parent.children.splice(indexOfSlotElement, 1);
        slotElements.push([parent, slotElem, indexOfSlotElement]);
    }
    template.document.writeToFile(clientRenderSettings, indexHTMLPath);
    // Replace slot elements
    slotElements.forEach(([parent, slotElem, index]) => parent.children.splice(index, 0, slotElem));
}