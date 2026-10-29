// Reuse and prepare Steam submenu windows. The original Steam button patch manages the layout.

(() => {
    "use strict";

    const shared = window.opener;
    if (!shared?.MILLENNIUM_API || shared.__nkSteamSubmenuSpeed) return;

    const api = shared.MILLENNIUM_API;
    const classes = api.findClassModule(value => value.ContextMenuPosition && value.contextMenuItem);
    const STEAM_MENU = "Steam Root Menu";
    const hasMethods = (...names) => value => typeof value === "function"
        && names.every(name => Object.hasOwn(value.prototype || {}, name));
    const Manager = api.findModuleExport(hasMethods("CreateContextMenuInstance", "ShowMenu"));
    const Popup = api.findModuleExport(hasMethods("Show", "UpdateParamsBeforeShow", "RenderInternal"));
    const Instance = api.findModuleExport(hasMethods("BIsSubMenu"));
    if (!Manager || !Popup || !Instance) return;
    const Base = Object.getPrototypeOf(Instance.prototype);
    const warmups = new WeakMap();

    // Keep at most one native popup per submenu ready between openings. Steam
    // still creates and removes its menu instances normally.
    let steamMenu;
    const popupPools = new WeakMap();
    const showPopup = Popup.prototype.Show;
    const closePopup = Popup.prototype.Close;

    function closeSubmenuPopups(root) {
        const pool = popupPools.get(root);
        if (!pool) return;
        for (const popup of pool.values()) {
            delete popup.__nkSteamMenuRoot;
            closePopup.call(popup);
        }
        pool.clear();
    }

    function popupPool(root) {
        let pool = popupPools.get(root);
        if (!pool) {
            pool = new Map();
            popupPools.set(root, pool);
            const hide = root.InternalHide;
            root.InternalHide = function (...args) {
                const result = hide.apply(this, args);
                for (const popup of pool.values()) popup.Close();
                return result;
            };
        }
        return pool;
    }

    Popup.prototype.Show = function (...args) {
        const suffix = this.params.target_browser ? "_uid" + this.params.target_browser.m_unPID : "";
        const instance = steamMenu?.Manager.GetVisibleMenus().find(menu =>
            menu.m_parentInstance === steamMenu && this.m_strName === "contextmenu_" + menu.key + suffix);
        if (instance) {
            const root = instance.m_parentInstance;
            const pool = popupPool(root);
            const anchor = instance.m_position.element;
            const previous = pool.get(anchor);
            if (previous) {
                // Steam's replacement path misses the old focus, blur and message handlers.
                previous.RemoveEventListeners();
                this.m_strName = previous.m_strName;
            }
            // Steam transfers the existing window and its loaded styles to the
            // new popup object. No hidden submenu enters the shared menu manager.
            this.params.replace_existing_popup = true;
            this.__nkSteamMenuRoot = root;
            pool.set(anchor, this);
        }
        return showPopup.apply(this, args);
    };

    Popup.prototype.Close = function (...args) {
        const root = this.__nkSteamMenuRoot;
        if (root && this.m_bCreated && !this.m_renderWhenReady?.m_fnRender && !shared.g_PopupManager.m_bShuttingDown) {
            this.window?.SteamClient.Window.HideWindow();
            return;
        }
        // Fast pointer movement can cancel a window before creation finishes.
        // Remove that window from the pool before Steam closes it.
        const pool = root && popupPools.get(root);
        if (pool) {
            for (const [anchor, popup] of pool) {
                if (popup === this) pool.delete(anchor);
            }
        }
        return closePopup.apply(this, args);
    };

    const releaseHiddenMenu = Manager.prototype.ReleaseHiddenMenu;
    Manager.prototype.ReleaseHiddenMenu = function (instance, ...args) {
        stopWarming(instance);
        closeSubmenuPopups(instance);
        if (steamMenu === instance) steamMenu = undefined;
        return releaseHiddenMenu.call(this, instance, ...args);
    };

    let nextWarmWindow = 0;

    // window.open blocks Steam's UI thread. Warm only while all Steam windows
    // are unfocused, and wait for one window's styles before starting another.
    function warmSubmenuPopups(root, doc) {
        const win = doc.defaultView;
        const menuWin = root.m_element.ownerDocument.defaultView;
        let idle;
        let pending;
        let cancelled = false;
        const active = () => root.visible || doc.hasFocus()
            || [...shared.g_PopupManager.GetPopups()].some(popup => popup.focused
                || (popup.params.body_class?.includes("ContextMenuPopupBody") && popup.BIsVisible()));

        function schedule() {
            if (cancelled || pending || idle !== undefined) return;
            idle = win.requestIdleCallback(() => {
                idle = undefined;
                if (cancelled || active()) return;
                const pool = popupPool(root);
                const anchor = [...root.m_element.querySelectorAll("." + CSS.escape(classes.SubMenu))]
                    .find(element => !pool.has(element));
                if (!anchor) return;
                class WarmPopup extends Popup {
                    OnLoad() {}
                    OnClose() {}
                    Render() {
                        pending = undefined;
                        if (cancelled || pool.has(anchor) || !anchor.isConnected) {
                            closePopup.call(this);
                        } else {
                            this.__nkSteamMenuRoot = root;
                            pool.set(anchor, this);
                        }
                        schedule();
                    }
                }
                // The root popup is created with Steam's Hidden flag. Preserve
                // that flag so a warm window never appears or takes focus.
                pending = new WarmPopup("contextmenu_nk_warm_" + nextWarmWindow++, {
                    ...root.m_popupContextMenu.params,
                    title: "Menu",
                    dimensions: { width: 2, height: 1 },
                    bHideOnClose: false,
                    replace_existing_popup: false,
                });
                showPopup.call(pending, false);
            }, { timeout: 500 });
        }

        const content = new menuWin.MutationObserver(schedule);
        content.observe(root.m_element, { childList: true, subtree: true });
        win.addEventListener("blur", schedule);
        menuWin.addEventListener("blur", schedule);
        schedule();
        return () => {
            cancelled = true;
            win.cancelIdleCallback(idle);
            content.disconnect();
            win.removeEventListener("blur", schedule);
            menuWin.removeEventListener("blur", schedule);
            if (pending) closePopup.call(pending);
            pending = undefined;
        };
    }

    function stopWarming(root) {
        warmups.get(root)?.();
        warmups.delete(root);
    }

    function prepare(root) {
        if (root.m_options.title !== STEAM_MENU || !root.m_element || warmups.has(root)) return;
        steamMenu = root;
        warmups.set(root, warmSubmenuPopups(root, root.m_position.element.ownerDocument));
    }

    const setElement = Base.SetElement;
    Base.SetElement = function (element) {
        const result = setElement.call(this, element);
        if (element) prepare(this);
        else stopWarming(this);
        return result;
    };

    const showMenu = Manager.prototype.ShowMenu;
    Manager.prototype.ShowMenu = function (instance, ...args) {
        if (instance.m_options.title === STEAM_MENU) steamMenu = instance;
        const result = showMenu.call(this, instance, ...args);
        prepare(instance);
        return result;
    };

    // The retained Steam menu can already exist when this optional script loads.
    for (const popup of shared.g_PopupManager.GetPopups()) {
        const element = popup.window?.document.querySelector("." + CSS.escape(classes.contextMenu));
        if (!element) continue;
        for (let fiber = api.getReactInstance(element); fiber; fiber = fiber.return) {
            if (fiber.memoizedProps?.instance) {
                prepare(fiber.memoizedProps.instance);
                break;
            }
        }
    }
    shared.__nkSteamSubmenuSpeed = true;
})();
