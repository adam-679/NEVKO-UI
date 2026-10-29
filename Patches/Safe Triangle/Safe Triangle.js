// Safe Triangle: keep an open submenu while the pointer moves diagonally toward it.
// Each document has one pointer tracker; native menu actions and keyboard handling stay unchanged.

(() => {
    "use strict";

    const shared = window.opener;
    if (!shared?.MILLENNIUM_API || shared.__nkSafeTriangle) return;

    const api = shared.MILLENNIUM_API;
    const classes = api.findClassModule(value => value.ContextMenuPosition && value.contextMenuItem);
    const MENU = "." + CSS.escape(classes.contextMenu);
    const ITEM = "." + CSS.escape(classes.contextMenuItem);
    const EDGE_BUFFER = 8;
    const STOP_DELAY = 300;
    const documents = new WeakMap();

    function menuPosition(element) {
        for (let fiber = api.getReactInstance(element); fiber; fiber = fiber.return) {
            if (fiber.stateNode?.PositionMenu) return fiber.stateNode;
        }
    }

    function submenuRect(element, doc) {
        if (element.ownerDocument === doc) return element.getBoundingClientRect();
        // Native Linux popup windows can report screenX/screenY as zero. Steam
        // positions these windows relative to the parent using this same state.
        const position = menuPosition(element);
        const { menuLeft, menuTop, menuWidth, menuHeight } = position.state;
        if ([menuLeft, menuTop, menuWidth, menuHeight].some(value => value === undefined)) return;
        const left = menuLeft - position.parentWin.screenX;
        const top = menuTop - position.parentWin.screenY;
        return {
            left,
            right: left + menuWidth,
            top,
            bottom: top + menuHeight,
        };
    }

    function inTriangle(point, origin, top, bottom) {
        const side = (a, b) => (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
        const signs = [side(origin, top), side(top, bottom), side(bottom, origin)];
        return signs.every(value => value >= 0) || signs.every(value => value <= 0);
    }

    function attach(doc) {
        if (documents.has(doc)) return;
        const win = doc.defaultView;
        let state;
        let timer;
        let replaying = false;

        function cancel() {
            win.clearTimeout(timer);
            timer = undefined;
            if (state) state.pending = undefined;
        }

        function clear() {
            cancel();
            state = undefined;
        }

        function track(target, point) {
            const menu = target?.closest?.(MENU);
            const instance = menu && menuPosition(menu)?.props.instance;
            if (!instance?.visible) {
                clear();
                return;
            }
            if (state?.instance !== instance) {
                clear();
                state = { instance, point, item: target.closest(ITEM) };
            }
            const anchor = instance.submenu?.m_position.element;
            if (anchor !== state.anchor) {
                state.anchor = anchor;
                state.origin = state.item === anchor ? state.point : undefined;
            }
            return state;
        }

        function aiming(point) {
            const submenu = state.instance.submenu;
            const element = submenu?.m_element;
            if (!state.origin || !element || !submenu.visible) return false;
            const rect = submenuRect(element, doc);
            if (!rect) return false;
            const anchor = state.anchor.getBoundingClientRect();
            const direction = rect.left + rect.right >= anchor.left + anchor.right ? 1 : -1;
            if ((point.x - state.point.x) * direction <= 0) return false;
            const edge = direction > 0 ? rect.left : rect.right;
            return inTriangle(point, state.origin,
                { x: edge, y: rect.top - EDGE_BUFFER },
                { x: edge, y: rect.bottom + EDGE_BUFFER });
        }

        function activate() {
            const target = state?.pending;
            const point = state?.point;
            cancel();
            if (!target?.isConnected || !state.instance.visible || target !== state.item) return;
            replaying = true;
            try {
                target.dispatchEvent(new win.MouseEvent("mouseover", {
                    bubbles: true,
                    relatedTarget: null,
                    screenX: point.x + win.screenX,
                    screenY: point.y + win.screenY,
                    clientX: point.x,
                    clientY: point.y,
                }));
            } finally {
                replaying = false;
            }
        }

        function move(event) {
            const point = { x: event.clientX, y: event.clientY };
            if (!track(event.target, point)) return;
            const item = event.target.closest(ITEM);
            state.item = item;
            if (item === state.anchor) {
                state.origin = point;
                cancel();
            } else if (state.pending) {
                if (aiming(point)) {
                    win.clearTimeout(timer);
                    timer = win.setTimeout(activate, STOP_DELAY);
                } else {
                    state.point = point;
                    activate();
                    return;
                }
            }
            state.point = point;
        }

        function enter(event) {
            if (replaying) return;
            const target = event.type === "mouseout" ? event.relatedTarget : event.target;
            const point = { x: event.clientX, y: event.clientY };
            if (!track(target, point)) return;
            const item = target.closest(ITEM);
            if (!item || item === state.anchor || !aiming(point)) {
                cancel();
                state.item = item;
                return;
            }
            state.item = item;
            state.pending = item;
            state.instance.CancelHideSubMenuTimer();
            event.stopPropagation();
            win.clearTimeout(timer);
            timer = win.setTimeout(activate, STOP_DELAY);
        }

        doc.addEventListener("mousemove", move, { capture: true, passive: true });
        doc.addEventListener("mouseover", enter, true);
        doc.addEventListener("mouseout", enter, true);
        doc.addEventListener("pointerdown", clear, true);
        doc.addEventListener("keydown", clear, true);
        win.addEventListener("blur", clear);
        documents.set(doc, instance => {
            if (state?.instance === instance) clear();
        });
    }

    const Instance = api.findModuleExport(value =>
        typeof value === "function" && Object.hasOwn(value.prototype || {}, "BIsSubMenu"));
    if (!Instance) return;
    const Base = Object.getPrototypeOf(Instance.prototype);
    const setElement = Base.SetElement;
    Base.SetElement = function (element) {
        if (element) attach(element.ownerDocument);
        else documents.get(this.m_element?.ownerDocument)?.(this);
        return setElement.call(this, element);
    };

    attach(document);
    for (const popup of shared.g_PopupManager.GetPopups()) {
        const doc = popup.window?.document;
        if (doc?.body.classList.contains("ContextMenuPopupBody")) attach(doc);
    }
    shared.__nkSafeTriangle = true;
})();
