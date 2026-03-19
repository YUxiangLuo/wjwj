import { Window } from "happy-dom";

const domGlobalKeys = [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLButtonElement",
    "Element",
    "Node",
    "DocumentFragment",
    "SVGElement",
    "Event",
    "MouseEvent",
    "KeyboardEvent",
    "CustomEvent",
    "PopStateEvent",
    "MutationObserver",
    "getComputedStyle",
    "localStorage",
    "sessionStorage",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "matchMedia",
] as const;

type DomGlobalKey = (typeof domGlobalKeys)[number];
type DomGlobals = { [Key in DomGlobalKey]: (typeof globalThis)[Key] };
type DomGlobalDescriptors = Partial<Record<DomGlobalKey, PropertyDescriptor | undefined>>;

function castDomGlobal<T>(value: unknown): T {
    return value as T;
}

function defineConfigurableValue(target: object, key: PropertyKey, value: unknown) {
    Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
    });
}

function captureGlobalDescriptors(): DomGlobalDescriptors {
    const descriptors: DomGlobalDescriptors = {};

    for (const key of domGlobalKeys) {
        descriptors[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    }

    return descriptors;
}

function restoreGlobalDescriptors(descriptors: DomGlobalDescriptors) {
    for (const key of domGlobalKeys) {
        const descriptor = descriptors[key];

        if (descriptor) {
            Object.defineProperty(globalThis, key, descriptor);
            continue;
        }

        delete (globalThis as Record<PropertyKey, unknown>)[key];
    }
}

export function installDomGlobals(url = "http://localhost/") {
    const window = new Window({
        url,
        settings: {
            disableComputedStyleRendering: true,
        },
    });
    const previousGlobalDescriptors = captureGlobalDescriptors();
    const previousActEnvironmentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
    const matchMedia: DomGlobals["matchMedia"] = (query: string) =>
        castDomGlobal<MediaQueryList>({
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        });

    defineConfigurableValue(window, "event", undefined);
    defineConfigurableValue(window, "SyntaxError", SyntaxError);
    defineConfigurableValue(window, "DOMException", DOMException);
    defineConfigurableValue(window, "matchMedia", matchMedia);

    const nextGlobals = {
        window: castDomGlobal<typeof globalThis.window>(window),
        document: castDomGlobal<typeof globalThis.document>(window.document),
        navigator: castDomGlobal<typeof globalThis.navigator>(window.navigator),
        HTMLElement: castDomGlobal<typeof globalThis.HTMLElement>(window.HTMLElement),
        HTMLInputElement: castDomGlobal<typeof globalThis.HTMLInputElement>(window.HTMLInputElement),
        HTMLButtonElement: castDomGlobal<typeof globalThis.HTMLButtonElement>(window.HTMLButtonElement),
        Element: castDomGlobal<typeof globalThis.Element>(window.Element),
        Node: castDomGlobal<typeof globalThis.Node>(window.Node),
        DocumentFragment: castDomGlobal<typeof globalThis.DocumentFragment>(window.DocumentFragment),
        SVGElement: castDomGlobal<typeof globalThis.SVGElement>(window.SVGElement),
        Event: castDomGlobal<typeof globalThis.Event>(window.Event),
        MouseEvent: castDomGlobal<typeof globalThis.MouseEvent>(window.MouseEvent),
        KeyboardEvent: castDomGlobal<typeof globalThis.KeyboardEvent>(window.KeyboardEvent),
        CustomEvent: castDomGlobal<typeof globalThis.CustomEvent>(window.CustomEvent),
        PopStateEvent: castDomGlobal<typeof globalThis.PopStateEvent>(window.PopStateEvent),
        MutationObserver: castDomGlobal<typeof globalThis.MutationObserver>(window.MutationObserver),
        getComputedStyle: castDomGlobal<typeof globalThis.getComputedStyle>(window.getComputedStyle.bind(window)),
        localStorage: castDomGlobal<typeof globalThis.localStorage>(window.localStorage),
        sessionStorage: castDomGlobal<typeof globalThis.sessionStorage>(window.sessionStorage),
        requestAnimationFrame:
            castDomGlobal<typeof globalThis.requestAnimationFrame>((callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0) as unknown as number),
        cancelAnimationFrame: castDomGlobal<typeof globalThis.cancelAnimationFrame>((handle: number) => clearTimeout(handle)),
        matchMedia,
    } satisfies DomGlobals;

    for (const key of domGlobalKeys) {
        defineConfigurableValue(globalThis, key, nextGlobals[key]);
    }

    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
        configurable: true,
        value: true,
    });

    return {
        window,
        restore() {
            restoreGlobalDescriptors(previousGlobalDescriptors);
            if (previousActEnvironmentDescriptor) {
                Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousActEnvironmentDescriptor);
            } else {
                delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
            }
        },
    };
}
