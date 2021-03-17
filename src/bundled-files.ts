/*Automatically generated from inject-bundle.js */
export const fileBundle = new Map(
    [
        ["component.ts", "import { cOO } from \"./observable\";\n\n/**\n * Adds reusable prism functionality on top of the base HTMLElement class\n */\nexport abstract class Component<T> extends HTMLElement {\n    // The private cached (un-proxied) component data\n    _d: Partial<T> = {};\n    // Proxied data\n    _dP: Partial<T> = {};\n\n    // Like isConnected but false until connectedCallback is finished\n    _isR: boolean = false;\n\n    // Caches for element lookup\n    // TODO new Map could be lazy\n    _eC: Map<string, Element> = new Map();\n    _ifEC: Map<string, Element> = new Map();\n\n    abstract layout: true | undefined; // Used by router to detect if SSR content is layout\n    abstract _t: T | undefined; // The primary observable\n\n    // A callback for when triggered from a router where params are a set of URL params\n    abstract load?: (params?: Object) => Promise<void>;\n\n    // CSR component\n    abstract render();\n\n    // Add and remove event bindings, a = add\n    abstract handleEvents(a: boolean): void;\n\n    // User defined lifecycle callbacks (which don't interfere with connectedCallback)\n    abstract connected(): void | undefined;\n    abstract disconnected(): void | undefined;\n\n    // Used to retrieve elements inside the components DOM using a set class name by the Prism compiler\n    // Also caches the element as to not call querySelector every time\n    // Using query selector will work across csr and ssr component dom\n    // TODO cache invalidation if element is not connected???\n    getElem(id: string) {\n        if (this._eC.has(id)) {\n            return this._eC.get(id);\n        } else {\n            const e = (this.shadowRoot ?? this).querySelector(`.${id}`);\n            if (e) this._eC.set(id, e);\n            return e;\n        }\n    }\n\n    // Used to manually update the cache\n    setElem(id: string, e: HTMLElement) {\n        e.classList.add(id);\n        this._eC.set(id, e);\n    }\n\n    // Returns reactivity state of the component. Deep changes will be reflected in the dom. Will only create observable once\n    get data(): Partial<T> {\n        if (!this._isR) {\n            return this._d;\n        }\n        if (!this._t) {\n            // @ts-expect-error ._bindings does exist statically on derived class (abstract static)\n            this._t = cOO.call(this, this.constructor._bindings, this._d, this._dP)\n        }\n        return this._t;\n    }\n\n    // Deeply assign values \n    set data(value) {\n        if (this._isR) {\n            Object.assign(this.data, value)\n        } else {\n            this._d = value\n        }\n    }\n\n    connectedCallback() {\n        // If component has been sever side rendered\n        if (this.hasAttribute(\"data-ssr\")) {\n            this._d = {};\n            this.handleEvents?.(true);\n        } else {\n            this.render()\n        }\n        this.connected?.();\n        this._isR = true;\n    }\n\n    disconnectedCallback() {\n        this.disconnected?.();\n        this.handleEvents?.(false);\n        this._isR = false;\n        this._eC.clear()\n    }\n}"], 
        ["helpers.ts", "import type { Component } from \"./component\";\n\n/**\n * Utility function for swapping elements, used under #if cssu (client side state updates)\n * @param p A expression which if evaluates to truthy will sw\n * @param id \n * @param elementGenerator A function to generate the nodes. The element predicate value is aware of the value of the predicate. TODO could be sent value to not reevaluate\n */\nexport function conditionalSwap(this: Component<any>, p: boolean, id: string, elementGenerator: () => HTMLElement): void {\n    // (o)ldElem\n    const oE: Element = this.getElem(id);\n    // Don't change the element if the value of the predicate hasn't changed\n    if (!!p === oE.hasAttribute(\"data-else\")) {\n        // this._ifSwapElemCache.get(id) will always return the prev discarded (if it was generated)\n        const nE = this._ifEC.get(id) ?? elementGenerator.call(this);\n        this.setElem(id, nE); // Manually update cache\n        this._ifEC.set(id, oE);\n        oE.replaceWith(nE); // Replace the element\n    }\n}\n\n/**\n * Assign to e if it exists\n * @param e Component instance or CharacterData to assign to\n * @param v Value to attempt to assign\n * @param p Property to assign to (defaults to \"data\")\n */\nexport function tryAssignData(e: CharacterData | Component<any> | null, v: any, p = \"data\") {\n    if (e) Reflect.set(e, p, v);\n}\n\n/**\n * Given a element, cut out old children and for each old one call its remove function to remove it from the DOM.\n * This is when called by observable arrays\n * @param p Parent element (one with #for on)\n * @param l The target length for the parent.children\n */\nexport function setLength(p: HTMLElement | null, l: number) {\n    if (p) Array.from(p.children).splice(l).forEach(e => e.remove());\n}\n\n/**\n * Returns true if array has holes / undefined elements\n * @example `isArrayHoley([,,1]) -> true`\n * @param a Array\n */\nexport function isArrayHoley<T>(a: Array<T>): boolean {\n    for (let i = 0; i < a.length; i++) {\n        if (a[i] === undefined) return true;\n    }\n    return false;\n}\n\n/**\n * Generic function for adding or removing events to some element given a id, event name and callback\n * @param t the component to add to\n * @param id the id of the element\n * @param en the event name to bind to\n * @param cb the callback\n * @param enable to remove the \"disabled\" attribute\n */\nexport function changeEvent(t: Component<any>, id: string, en: string, cb: any, add = true, enable = true) {\n    const elem = t.getElem(id);\n    if (!elem) return;\n    if (add) {\n        elem.addEventListener(en, cb);\n        if (enable) elem.removeAttribute(\"disabled\");\n    } else {\n        elem.removeEventListener(en, cb);\n        if (enable) elem.setAttribute(\"disabled\", \"\");\n    }\n}"], 
        ["index.prism", "<template>\n    <h1>Hello World</h1>\n</template>\n\n<script>\n    @Page(\"/\")\n    class IndexPage extends Component {}\n</script>"], 
        ["observable.ts", "import type { Component } from \"./component\";\nimport { isArrayHoley } from \"./helpers\";\n\n// TODO:\n// interface IMapping {\n//     type?: string,\n// }\n\n/**\n * (Create Observable)\n * Will create either a observable array, observable object or a existing object based on the `type` of `chunk`\n * @param c Chunk to create observable over\n * @param d Any existing data\n * @param i Any indexes data is under\n */\nexport function cO(this: Component<any>, c: any, d: any, ...i: Array<number>) {\n    if (c.type === \"Date\") return cOD.call(this, d, c.set, ...i);\n    else if (c.get) return c.get.call(this, ...i);\n    else if (c.type === \"Array\") return cOA.call(this, c, d, [], ...i);\n    else return cOO.call(this, c, d, {}, ...i);\n}\n\n/**\n * (Create Observable Object)\n * Creates a proxy for data which fronts a mapping tree.\n *  - Calls get bindings if data is not cached\n *  - On set bindings calls set operations\n *  - On nested data recursively makes observables\n * @param m A set of mappings (generated by Prism)\n * @param d Any original data\n * @param pC Proxy cache. Holds proxies so they are not regenerated\n * @param i If the observable is under a array then a index\n */\nexport function cOO<T>(\n    this: Component<T>,\n    m: any,\n    d: Partial<T>,\n    pC: any = {},\n    ...i: Array<number>\n): T {\n    return new Proxy(d, {\n        // target, prop, receiver\n        get: (t, p, r) => {\n            // Work around for JSON.stringify thing\n            if (p === \"toJSON\") {\n                const o = Object;\n                return JSON.stringify(\n                    o.assign(t,\n                        o.fromEntries(o.keys(r).map(k => [k, r[k]]))))\n            }\n            // Get the respective (c)hunk on the mapping tree\n            const c = m[p];\n            if (!c) return;\n            // If chunk has type then the property is an object\n            if (c?.type) {\n                // TODO this is a bit janky \n                return pC[p] ??\n                    (pC[p] =\n                        cO.call(\n                            this,\n                            c,\n                            t[p] ?? (t[p] = c.type === \"Array\" ? [] : c.type === \"Date\" ? c.get?.call?.(this, ...i) : {}),\n                            ...i\n                        )\n                    )\n            }\n            // Try get property from cache (target) else get the prop and set its value to the cache\n            return t[p] ?? (t[p] = c.get?.call?.(this, ...i)); \n        },\n        // target, prop, value, receiver\n        set: (t, p, v, r) => {\n            // Get the respective (c)hunk on the mapping tree\n            const c = m[p];\n            // If has type assign the new object which ...\n            if (c?.type) {\n                Object.assign(pC[p] ?? r[p], v);\n                if (Array.isArray(v)) {\n                    pC[p].length = v.length;\n                }\n            } else {\n                Reflect.set(t, p, v);\n            }\n            // Try call set handlers\n            c?.set?.call?.(this, v, ...i)\n            return true;\n        },\n        has(_, p) {\n            return p in m;\n        },\n        ownKeys() {\n            return Object.keys(m)\n        },\n        getOwnPropertyDescriptor() {\n            return {configurable: true, enumerable: true, writable: true}\n        }\n    }) as T;\n}\n\n/**\n * (Create Observable Array)\n * TODO does not like reverse, shift and some other methods\n */\nexport function cOA<T>(\n    this: Component<any>,\n    m: any,\n    a: Array<T>,\n    pC: Array<any> = [], // Not always needed\n    ...i: Array<number>\n): Array<T> {\n    return new Proxy(a, {\n        get: (t, p, r) => {\n            if (p === \"toJSON\") return JSON.stringify(Object.assign(t ?? [], Array.from(r)));\n            if (p === \"length\") {\n                // Check that array is not wholely\n                return (!isArrayHoley(t) && t.length) || (t.length = m.length.get?.call?.(this, ...i) ?? 0);\n            }\n            if (m[\"*\"]?.type && typeof p !== \"symbol\" && !isNaN((p as number))) {\n                return pC[p]\n                    ?? (pC[p] = cO.call(\n                        this,\n                        m[\"*\"],\n                        a[p] ?? (a[p] = m[\"*\"].type === \"Array\" ? [] : {}),\n                        ...i,\n                        p\n                    ));\n            }\n            return t[p] ?? (t[p] = m[\"*\"].get.call(this, ...i, p));\n        },\n        set: (t, p, v, r) => {\n            Reflect.set(t, p, v);\n            // prevLength\n            let pl = t.length;\n            if (p === \"length\") {\n                if (v < pl) {\n                    m.length.set.call(this, ...i, v);\n                    m?.set?.call?.(this, t, ...i);\n                    if (m.type[\"*\"]) pC.length = v;\n                }\n            } else {\n                m?.set?.call?.(this, t, ...i);\n                if ((p as number) >= pl) {\n                    m.push.call(this, v, ...i);\n                } else {\n                    if (m[\"*\"].type) {\n                        // Assign to the cache on a per property basis. If proxyCache does not exist create it from the receiver\n                        Object.assign(pC[p] ?? r[p], v);\n                        if (Array.isArray(v)) pC[p].length = v.length;\n                    } else {\n                        m[\"*\"].set?.call?.(this, v, ...i, p);\n                    }\n                }\n            }\n            return true;\n        }\n    });\n}\n\n// Create observable Date object\nfunction cOD<T>(\n    this: Component<T>,\n    d: Date,\n    s?: (d: Date, ...i: Array<number>) => void,\n    ...i: Array<number>\n): Date {\n    return new Proxy(d, {\n        get: (t, p) => {\n            if (p.toString().startsWith(\"set\")) {\n                return (...a) => {\n                    let v = t[p](...a);\n                    s?.call?.(this, t, ...i);\n                    return v;\n                }\n            } else {\n                // Bind needed as internal date methods need it lol\n                return t[p].bind(t)\n            }\n        }\n    })\n}"], 
        ["others.ts", "/** Contains alternative runtime function implementations */\n\nimport { Component } from \"./component\";\nimport { oE } from \"./render\";\n\n/**\n * Minified h render function + no svg support\n * @param tn \n * @param a \n * @param v \n * @param c \n */\nfunction h(tn: string, a: Object | 0 = 0, v: Object | 0 = 0, ...c: Array<HTMLElement>): HTMLElement {\n    // (e)lement\n    const e = document.createElement(tn);\n    if (a) {\n        oE(a, ([k, v]) => {\n            if (k in e) {\n                e[k] = v;\n            } else {\n                e.setAttribute(k, v);\n            }\n        });\n    }\n    if (v) {\n        oE(v, ([eN, h]) => {\n            e.addEventListener(eN, h);\n        });\n    }\n    e.append(...c);\n    return e;\n}\n\n// Minimal version of create observable object for non datetime, array or nested object based envs\nfunction cOO<T>(\n    this: Component<T>,\n    m: any,\n    d: Partial<T>,\n): T {\n    return new Proxy(d, {\n        // target, prop, receiver\n        get: (t, p, r) => {\n            // Work around for JSON.stringify thing\n            if (p === \"toJSON\") {\n                return JSON.stringify(\n                    Object.assign(t,\n                        Object.fromEntries(Object.keys(r).map(k => [k, r[k]]))))\n            }\n            // Get the respective (c)hunk on the mapping tree\n            if (!m[p]) return;\n            return t[p];\n        },\n        // target, prop, value, receiver\n        set: (t, p, v) => {\n            // Try call set handlers\n            m[p]?.set?.call?.(this, v)\n            return Reflect.set(t, p, v)\n        },\n        has(_, p) {\n            return p in m;\n        },\n        ownKeys() {\n            return Object.keys(m)\n        },\n        getOwnPropertyDescriptor() {\n            return { configurable: true, enumerable: true, writable: true }\n        }\n    }) as T;\n}\n\nfunction connectedCallback() {\n    this.render();\n    this.connected?.();\n    this._isR = true;\n}\n\nfunction disconnectedCallback() {\n    this.disconnected?.();\n    this._isR = false;\n}"], 
        ["render.ts", "/**\n * Create Comment\n * Used for maintaining consistency of splitting text from SSR\n */\nexport function cC(comment: string = \"\"): Comment {\n    return document.createComment(comment);\n}\n\n// TODO temp\nconst svgElems = new Set([\"svg\", \"g\", \"line\", \"rect\", \"path\", \"ellipse\", \"circle\"]);\nexport const oE = (a, b) => Object.entries(a).forEach(b);\n\n/** \n * JSX minified render function \n * O's is used as a falsy value if the element does not have any attribute or events\n * @param tN (tagName)\n * @param a (attributes)\n * @param v (events)\n * @param c (children)\n*/\nexport function h(tn: string, a: Object | 0 = 0, v: Object | 0 = 0, ...c: Array<HTMLElement>): HTMLElement | SVGElement {\n    const isSvg = svgElems.has(tn);\n    const e = isSvg ? document.createElementNS(\"http://www.w3.org/2000/svg\", tn) : document.createElement(tn);\n    if (a) {\n        oE(a, ([k, v]) => {\n            // TODO temp, haven't figured the weird characteristics of IDL attributes and SVG\n            if (k in e && !isSvg) {\n                e[k] = v;\n            } else {\n                e.setAttribute(k, v);\n            }\n        });\n    }\n    if (v) {\n        oE(v, ([eN, h]) => {\n            e.addEventListener(eN, h);\n        });\n    }\n    e.append(...c);\n    return e;\n}"], 
        ["router.ts", "import type { Component } from \"./component\";\nimport { h } from \"./render\";\n\n/**\n * Router used under Prism. Singleton\n */\nexport class Router extends HTMLElement {\n    // this router\n    static t: HTMLElement;\n    // Routes are injected by prism compiler\n    static r: Array<[RegExp, string, string]>;\n\n    // TODO not needed under context=client\n    // loaded component\n    static lc: string | null = null;\n    // loaded layout\n    static ll: string | null = null;\n\n    connectedCallback() {\n        Router.t = this;\n    }\n\n    /* \n        Called when whole application is loaded in, if goTo creates a element that has not been registered then it cannot find its goto method \n    */\n    static init() {\n        window.onpopstate = () => {\n            Router.goTo(document.location.pathname);\n        }\n        const fc = Router.t.firstElementChild;\n        if (!fc) {\n            Router.goTo(window.location.pathname, false)\n        } else {\n            if ((fc as Component<any>)?.layout) {\n                Router.ll = (fc as Component<any>).tagName.toLowerCase();\n                Router.lc = ((fc as Component<any>).firstElementChild as Component<any>).tagName.toLowerCase();\n            } else {\n                Router.lc = (fc as Component<any>).tagName.toLowerCase();\n            }\n        }\n    }\n\n    /**\n     * Used to bind anchor tags to ignore default behavior and do client side routing\n     */\n    static bind(event: MouseEvent) {\n        // New tab clicks\n        if (event.ctrlKey) return;\n        Router.goTo((event.currentTarget as HTMLElement).getAttribute(\"href\"));\n        event.preventDefault();\n    }\n\n    /**\n     * Only reason its async is for awaiting page load\n     * TODO explain\n     * @param url \n     * @param ps push state\n     */\n    static async goTo(url: string, ps = true) {\n        let r = this.t;\n        if (ps) history.pushState({}, \"\", url)\n        // pattern component layout\n        for (const [p, comp, lay] of this.r) {\n            // match\n            const m = url.match(p);\n            if (m) {\n                if (this.lc === comp) {\n                    if (lay) {\n                        await (r.firstElementChild.firstElementChild as Component<any>).load?.(m.groups);\n                    } else {\n                        await (r.firstElementChild as Component<any>).load?.(m.groups);\n                    }\n                } else {\n                    // Container\n                    let c = r;\n                    if (lay) {   \n                        if (Router.ll === lay) {\n                            c = r.firstElementChild as Component<any>;\n                        } else {\n                            const newLayout = h(lay);\n                            r.firstElementChild ? r.firstElementChild.replaceWith(newLayout) : r.append(newLayout);\n                            c = newLayout as HTMLElement;\n                        }\n                    }\n                    Router.lc = comp;\n                    // New Component\n                    const nC = h(comp) as Component<any>;\n                    await nC.load?.(m.groups);\n                    // Rendering the component is deferred until till adding to dom which is next line\n                    c.firstElementChild ? c.firstElementChild.replaceWith(nC) : c.append(nC);\n                }\n                return;\n            }\n        }\n        throw Error(`No match found for ${url}`);\n    }\n}\n\nwindow.customElements.define(\"router-component\", Router);"], 
        ["server.ts", "/**\n * Escapes HTML on the server. From: https://stackoverflow.com/a/6234804/10048799\n */\nexport function escape(unsafe: string | number | boolean | Date): string {\n    return unsafe\n        .toString()\n        .replace(/&/g, \"&amp;\")\n        .replace(/</g, \"&lt;\")\n        .replace(/>/g, \"&gt;\")\n        .replace(/\"/g, \"&quot;\")\n        .replace(/'/g, \"&#039;\");\n}"], 
        ["template.html", "<!DOCTYPE html>\n<html lang=\"en\">\n\n<head>\n    <meta charset=\"UTF-8\">\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n    <slot for=\"meta\"></slot>\n</head>\n\n<body>\n    <slot for=\"content\"></slot>\n</body>\n\n</html>"]
    ]
)
export const prismVersion = "1.5.0-pre"