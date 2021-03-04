import { Module } from "../chef/javascript/components/module";
import { injectRoutes } from "./client-side-routing";
import { fileBundle } from "../bundled-files";
import { FunctionDeclaration } from "../chef/javascript/components/constructs/function";
import { ExportStatement, ImportStatement } from "../chef/javascript/components/statements/import-export";
import { ClassDeclaration } from "../chef/javascript/components/constructs/class";
import { VariableDeclaration } from "../chef/javascript/components/statements/variable";
import { Comment } from "../chef/javascript/components/statements/comments";
import { ValueTypes } from "../chef/javascript/components/value/value";
import { join } from "path";

export const clientModuleFilenames = [
    "component.ts",
    "helpers.ts",
    "observable.ts",
    "render.ts",
    "router.ts",
];

/** Functions, classes and variables in the Prism runtime */
export const preludeImports = ["Component", "conditionalSwap", "tryAssignData", "setLength", "isArrayHoley", "changeEvent", "cO", "cOO", "cOA", "h", "cC", "Router"].map(name => new VariableDeclaration(name));

export type IRuntimeFeatures =
    Record<
        "observableArrays" | "conditionals" | "isomorphic" | "svg" | "subObjects" | "observableDates",
        boolean
    >;

export const defaultRuntimeFeatures: IRuntimeFeatures = Object.freeze({
    observableArrays: false, 
    conditionals: false, 
    svg: false, 
    subObjects: false, 
    isomorphic: false, 
    observableDates: false
});

/**
 * Remove unused runtime logic from `bundle` according to the `runtimeFeatures` that are needed
 */
export function treeShakeBundle(runtimeFeatures: IRuntimeFeatures, bundle: Module) {
    if (!runtimeFeatures.isomorphic) {
        // Remove cC (create comment) helper
        bundle.statements = bundle.statements.filter(statement => !(
            statement instanceof ExportStatement && 
            statement.exported instanceof FunctionDeclaration && ( 
                statement.exported.name?.name === "cC" ||
                statement.exported.name?.name === "changeEvent"
            )
        ));

        const otherStatements = Module.fromString(fileBundle.get("others.ts")!, "others.ts").statements;
        const componentClass = (bundle.statements.find(statement =>
            statement instanceof ExportStatement && statement.exported instanceof ClassDeclaration && statement.exported.name?.name === "Component"
        ) as ExportStatement).exported as ClassDeclaration;

        componentClass.methods!.get("connectedCallback")!.statements = (otherStatements.find(statement => statement instanceof FunctionDeclaration && statement.name?.name === "connectedCallback") as FunctionDeclaration).statements;

        componentClass.methods!.get("disconnectedCallback")!.statements = (otherStatements.find(statement => statement instanceof FunctionDeclaration && statement.name?.name === "disconnectedCallback") as FunctionDeclaration).statements;

    }
    if (!runtimeFeatures.conditionals) {
        // Remove setElem and _ifEC
        const componentClass = (bundle.statements.find(statement =>
            statement instanceof ExportStatement && statement.exported instanceof ClassDeclaration && statement.exported.name?.name === "Component"
        ) as ExportStatement).exported as ClassDeclaration;
        componentClass.members = componentClass.members.filter(member => !(
            !(member instanceof Comment) && (
                member instanceof VariableDeclaration && member.name === "_ifEC" ||
                member instanceof FunctionDeclaration && member.actualName === "setElem"
            )
        ));

        // Remove conditionalSwap and tryAssignData
        bundle.statements = bundle.statements.filter(statement => !(
            statement instanceof ExportStatement && statement.exported instanceof FunctionDeclaration &&
            ["conditionalSwap", "tryAssignData"].includes(statement.exported.actualName!)
        ));
    }
    if (!runtimeFeatures.observableArrays) {
        // Remove createObservableArray, isArrayHoley and setLength functions
        bundle.statements = bundle.statements.filter(statement => !(
            statement instanceof ExportStatement && statement.exported instanceof FunctionDeclaration && ["cOA", "isArrayHoley", "setLength"].includes(statement.exported.actualName!)
        ));
    }
    if (!runtimeFeatures.observableDates) {
        // Remove createObservableDate function
        bundle.statements = bundle.statements.filter(statement => !(
            statement instanceof ExportStatement && 
            statement.exported instanceof FunctionDeclaration && 
            statement.exported.actualName === "cOD"
        ));
    }
    if (!runtimeFeatures.svg) {
        // Remove svgElems set that is needed to decide whether to create a element in the svg namespace
        bundle.statements = bundle.statements.filter(statement => !(
            statement instanceof VariableDeclaration && statement.name === "svgElems"
        ));

        // Get renderFunction and replace its statements for statements that do not take svg elements into account
        const renderFunction = bundle.statements.find(statement =>
            statement instanceof ExportStatement &&
            statement.exported instanceof FunctionDeclaration &&
            statement.exported.name?.name === "h") as ExportStatement;

        (renderFunction.exported as FunctionDeclaration).statements =
            (Module.fromString(fileBundle.get("others.ts")!, "others.ts").statements
                .find(statement =>
                    statement instanceof FunctionDeclaration &&
                    statement.name?.name === "h"
                ) as FunctionDeclaration)
                .statements;
    }
    if (!runtimeFeatures.subObjects && !runtimeFeatures.observableDates && !runtimeFeatures.observableArrays) {
        // Remove createObservable function (branching for creating observables on 
        // dates, arrays, nested objects or other external components
        bundle.statements = bundle.statements.filter(statement => !(
            statement instanceof ExportStatement &&
            statement.exported instanceof FunctionDeclaration &&
            statement.exported.name?.name === "cO"
        ));

        const smallerCreateObservableObject = Module.fromString(fileBundle.get("others.ts")!, "others.ts")
            .statements.find(statement =>
                statement instanceof FunctionDeclaration && statement.name?.name === "cOO"
            );

        (bundle.statements.find(statement =>
            statement instanceof ExportStatement &&
            statement.exported instanceof FunctionDeclaration &&
            statement.exported.name?.name === "cOO"
        ) as ExportStatement).exported = smallerCreateObservableObject as ValueTypes;
    }
}

/**
 * Returns the whole Prism client as a module.
 * @param clientSideRouting Include the client router module (including injecting routes)
 */
export function getPrismClient(clientSideRouting: boolean = true): Module {
    const bundle = new Module("prism");
    for (const clientLib of clientModuleFilenames) {
        const module = Module.fromString(fileBundle.get(clientLib)!, join("bundle", clientLib));
        if (clientLib.endsWith("router.ts")) {
            if (!clientSideRouting) continue;
            injectRoutes(module);
        }
        bundle.combine(module);
    }

    // As they are combined can remove imports
    bundle.statements = bundle.statements.filter(statement => !(statement instanceof ImportStatement));

    return bundle;
}