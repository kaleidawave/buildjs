import { Component } from "../component";
import { defaultRuntimeFeatures, getPrismClient, IRuntimeFeatures, treeShakeBundle } from "./prism-client";
import { Module } from "../chef/javascript/components/module";
import { Stylesheet } from "../chef/css/stylesheet";
import { IRenderSettings, ModuleFormat, ScriptLanguages } from "../chef/helpers";
import { IFinalPrismSettings } from "../settings";
import { fileBundle } from "../bundled-files";
import { join } from "../filesystem";

/**
 * Generate a script for a single client
 * @param componentPath 
 */
export function compileSingleComponent(
    componentPath: string,
    settings: IFinalPrismSettings
): void {
    const features: IRuntimeFeatures = { ...defaultRuntimeFeatures, isomorphic: settings.context === "isomorphic" };

    if (settings.buildTimings) console.time("Parse component file and its imports");
    const component = Component.registerComponent(componentPath, settings, features);
    if (settings.buildTimings) console.timeEnd("Parse component file and its imports");

    const bundledClientModule = getPrismClient(false);
    treeShakeBundle(features, bundledClientModule);
    bundledClientModule.filename = join(settings.absoluteOutputPath, "component.js");
    const bundledStylesheet = new Stylesheet(join(settings.absoluteOutputPath, "component.css"));

    // This bundles all the components together into a single client module, single stylesheet
    addComponentToBundle(component, bundledClientModule, bundledStylesheet);

    // TODO temporary removing of all imports and exports as it is a bundle 
    bundledClientModule.removeImportsAndExports();

    if (settings.buildTimings) console.time("Render and write script & style bundle");

    const clientRenderSettings: Partial<IRenderSettings> = {
        minify: settings.minify,
        moduleFormat: ModuleFormat.ESM,
        comments: settings.comments
    };

    bundledClientModule.writeToFile(clientRenderSettings);
    if (bundledStylesheet.rules.length > 0) {
        bundledStylesheet.writeToFile(clientRenderSettings);
    }

    if (settings.context === "isomorphic") {
        if (settings.backendLanguage === "rust") {
            throw Error("Not implemented: compile-component --backendLanguage rust")
        }
        const bundledServerModule = Module.fromString(fileBundle.get("server.ts")!, "server.ts");
        bundledServerModule.filename = join(settings.absoluteOutputPath, "component.server.js");
        for (const [, comp] of Component.registeredComponents) {
            bundledServerModule.combine(comp.serverModule! as Module);
        }
        bundledServerModule.removeImportsAndExports();
        bundledServerModule.writeToFile({
            scriptLanguage: settings.backendLanguage === "js" ? ScriptLanguages.Javascript : ScriptLanguages.Typescript
        });
    }
    if (settings.buildTimings) console.timeEnd("Render and write script & style bundle");

    console.log(`Wrote out component.js and component.css to ${settings.outputPath}`);
    console.log(`Built web component, use with "<${component.tagName}></${component.tagName}>" or "document.createElement("${component.tagName}")"`);
}

/**
 * Adds components scripts and stylesheet to a given Module and Stylesheet
 * Recursively adds the imported components
 * TODO server module
 * @param component 
 * @param scriptBundle 
 * @param styleBundle 
 */
function addComponentToBundle(
    component: Component, 
    scriptBundle: Module, 
    styleBundle?: Stylesheet, 
    bundleComponents: Set<Component> = new Set()
): void {
    scriptBundle.combine(component.clientModule);
    if (component.stylesheet && !component.useShadowDOM && styleBundle) {
        styleBundle.combine(component.stylesheet);
    }
    for (const [, importedComponent] of component.importedComponents) {
        // Handles cyclic imports
        if (bundleComponents.has(importedComponent)) continue;

        bundleComponents.add(importedComponent);
        addComponentToBundle(importedComponent, scriptBundle, styleBundle, bundleComponents);
    }
}