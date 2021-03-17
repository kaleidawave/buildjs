/** Contains alternative runtime function implementations */

import { Component } from "./component";
import { oE } from "./render";

/**
 * Minified h render function + no svg support
 * @param tn 
 * @param a 
 * @param v 
 * @param c 
 */
function h(tn: string, a: Object | 0 = 0, v: Object | 0 = 0, ...c: Array<HTMLElement>): HTMLElement {
    // (e)lement
    const e = document.createElement(tn);
    if (a) {
        oE(a, ([k, v]) => {
            if (k in e) {
                e[k] = v;
            } else {
                e.setAttribute(k, v);
            }
        });
    }
    if (v) {
        oE(v, ([eN, h]) => {
            e.addEventListener(eN, h);
        });
    }
    e.append(...c);
    return e;
}

// Minimal version of create observable object for non datetime, array or nested object based envs
function cOO<T>(
    this: Component<T>,
    m: any,
    d: Partial<T>,
): T {
    return new Proxy(d, {
        // target, prop, receiver
        get: (t, p, r) => {
            // Work around for JSON.stringify thing
            if (p === "toJSON") {
                return JSON.stringify(
                    Object.assign(t,
                        Object.fromEntries(Object.keys(r).map(k => [k, r[k]]))))
            }
            // Get the respective (c)hunk on the mapping tree
            if (!m[p]) return;
            return t[p];
        },
        // target, prop, value, receiver
        set: (t, p, v) => {
            // Try call set handlers
            m[p]?.set?.call?.(this, v)
            return Reflect.set(t, p, v)
        },
        has(_, p) {
            return p in m;
        },
        ownKeys() {
            return Object.keys(m)
        },
        getOwnPropertyDescriptor() {
            return { configurable: true, enumerable: true, writable: true }
        }
    }) as T;
}

function connectedCallback() {
    this.render();
    this.connected?.();
    this._isR = true;
}

function disconnectedCallback() {
    this.disconnected?.();
    this._isR = false;
}