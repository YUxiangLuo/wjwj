import { Window } from "happy-dom";

type DomGlobals = {
    window?: typeof globalThis.window;
    document?: typeof globalThis.document;
    navigator?: typeof globalThis.navigator;
    HTMLElement?: typeof globalThis.HTMLElement;
    HTMLInputElement?: typeof globalThis.HTMLInputElement;
    HTMLButtonElement?: typeof globalThis.HTMLButtonElement;
    Element?: typeof globalThis.Element;
    Node?: typeof globalThis.Node;
    NodeFilter?: typeof globalThis.NodeFilter;
    DocumentFragment?: typeof globalThis.DocumentFragment;
    SVGElement?: typeof globalThis.SVGElement;
    Event?: typeof globalThis.Event;
    MouseEvent?: typeof globalThis.MouseEvent;
    KeyboardEvent?: typeof globalThis.KeyboardEvent;
    CustomEvent?: typeof globalThis.CustomEvent;
    PopStateEvent?: typeof globalThis.PopStateEvent;
    MutationObserver?: typeof globalThis.MutationObserver;
    ResizeObserver?: typeof globalThis.ResizeObserver;
    getComputedStyle?: typeof globalThis.getComputedStyle;
    localStorage?: typeof globalThis.localStorage;
    sessionStorage?: typeof globalThis.sessionStorage;
    requestAnimationFrame?: typeof globalThis.requestAnimationFrame;
    cancelAnimationFrame?: typeof globalThis.cancelAnimationFrame;
    matchMedia?: typeof globalThis.matchMedia;
};

export function installDomGlobals(url = "http://localhost/") {
    const window = new Window({
        url,
        settings: {
            disableComputedStyleRendering: true,
        },
    });
    const previous: DomGlobals = {
        window: globalThis.window,
        document: globalThis.document,
        navigator: globalThis.navigator,
        HTMLElement: globalThis.HTMLElement,
        HTMLInputElement: globalThis.HTMLInputElement,
        HTMLButtonElement: globalThis.HTMLButtonElement,
        Element: globalThis.Element,
        Node: globalThis.Node,
        NodeFilter: globalThis.NodeFilter,
        DocumentFragment: globalThis.DocumentFragment,
        SVGElement: globalThis.SVGElement,
        Event: globalThis.Event,
        MouseEvent: globalThis.MouseEvent,
        KeyboardEvent: globalThis.KeyboardEvent,
        CustomEvent: globalThis.CustomEvent,
        PopStateEvent: globalThis.PopStateEvent,
        MutationObserver: globalThis.MutationObserver,
        ResizeObserver: globalThis.ResizeObserver,
        getComputedStyle: globalThis.getComputedStyle,
        localStorage: globalThis.localStorage,
        sessionStorage: globalThis.sessionStorage,
        requestAnimationFrame: globalThis.requestAnimationFrame,
        cancelAnimationFrame: globalThis.cancelAnimationFrame,
        matchMedia: globalThis.matchMedia,
    };
    const previousActEnvironmentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");

    Object.assign(globalThis, {
        window,
        document: window.document,
        navigator: window.navigator,
        HTMLElement: window.HTMLElement,
        HTMLInputElement: window.HTMLInputElement,
        HTMLButtonElement: window.HTMLButtonElement,
        Element: window.Element,
        Node: window.Node,
        NodeFilter: window.NodeFilter,
        DocumentFragment: window.DocumentFragment,
        SVGElement: window.SVGElement,
        Event: window.Event,
        MouseEvent: window.MouseEvent,
        KeyboardEvent: window.KeyboardEvent,
        CustomEvent: window.CustomEvent,
        PopStateEvent: window.PopStateEvent,
        MutationObserver: window.MutationObserver,
        ResizeObserver: window.ResizeObserver,
        getComputedStyle: window.getComputedStyle.bind(window),
        localStorage: window.localStorage,
        sessionStorage: window.sessionStorage,
        requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0) as unknown as number,
        cancelAnimationFrame: (handle: number) => clearTimeout(handle),
        matchMedia: window.matchMedia,
    });

    Object.defineProperty(window, "event", {
        configurable: true,
        enumerable: true,
        value: undefined,
        writable: true,
    });
    Object.assign(window, {
        SyntaxError,
        DOMException,
    });

    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
        configurable: true,
        value: true,
    });

    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    return {
        window,
        restore() {
            Object.assign(globalThis, previous);
            if (previousActEnvironmentDescriptor) {
                Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousActEnvironmentDescriptor);
            } else {
                delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
            }
        },
    };
}
