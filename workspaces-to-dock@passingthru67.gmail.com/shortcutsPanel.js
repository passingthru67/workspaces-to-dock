const _DEBUG_ = false;

const Graphene = imports.gi.Graphene;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Shell = imports.gi.Shell;
const Meta = imports.gi.Meta;
const Lang = imports.lang;
const Signals = imports.signals;
const Params = imports.misc.params;
const Config = imports.misc.config;
const GnomeSession = imports.misc.gnomeSession;
const AppDisplay = imports.ui.appDisplay;
const AppFavorites = imports.ui.appFavorites;
const Layout = imports.ui.layout;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const DND = imports.ui.dnd;
const IconGrid = imports.ui.iconGrid;

const Util = imports.misc.util;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = imports.misc.extensionUtils.getCurrentExtension();

const PlaceDisplay = Me.imports.placeDisplay;
const Convenience = Me.imports.convenience;

const MENU_POPUP_TIMEOUT = 600;

const ApplicationType = {
    APPLICATION: 0,
    PLACE: 1,
    RECENT: 2,
    APPSBUTTON: 3
};

const ShortcutsPanelOrientation = {
    OUTSIDE: 0,
    INSIDE: 1
};

let recentlyClickedAppLoopId = 0;
let recentlyClickedApp = null;
let recentlyClickedAppWindows = null;
let recentlyClickedAppIndex = 0;

// Filter out unnecessary windows, for instance nautilus desktop window.
function getInterestingWindows(app) {
    return app.get_windows().filter((w) => {
        return !w.skip_taskbar;
    });
}

/* Return the actual position reverseing left and right in rtl */
function getPosition(settings) {
    let position = settings.get_enum('dock-position');
    if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL) {
        if (position == St.Side.LEFT)
            position = St.Side.RIGHT;
        else if (position == St.Side.RIGHT)
            position = St.Side.LEFT;
    }
    return position;
}

function getAppFromSource(source) {
    if (source instanceof AppDisplay.AppIcon) {
        return source.app;
    } else if (source instanceof ShortcutButton) {
        if (source._type == ApplicationType.APPLICATION)
            return source.app;
        else
            return null;
    } else {
        return null;
    }
}

function _getViewFromIcon(icon) {
    for (let parent = icon.get_parent(); parent; parent = parent.get_parent()) {
        if (parent instanceof ShortcutsPanel)
            return parent;
    }
    return null;
}

var MyDragPlaceholderItem = GObject.registerClass(
class WorkspacesToDock_MyDragPlaceholderItem extends St.Widget {
    _init() {
        super._init({ style_class: 'placeholder',
                      opacity: 0,
                      x_expand: true,
                      y_expand: true,
                      x_align: Clutter.ActorAlign.CENTER,
                      y_align: Clutter.ActorAlign.CENTER });

        this._settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        let iconSize = this._settings.get_double('shortcuts-panel-icon-size');
        this.set_size(iconSize, iconSize);
    }
});

var ShortcutButton = GObject.registerClass({
    Signals: {
        'menu-state-changed': { param_types: [GObject.TYPE_BOOLEAN] },
        'sync-tooltip': {},
    },
}, class WorkspacesToDock_ShortcutButton extends St.Button {
    _init(app, appType, panel) {
        super._init({
            style_class: 'app-well-app workspacestodock-shortcut-button',
            pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
            reactive: true,
            button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
            can_focus: true,
        });

        this.app = app;
        //this.id = app.get_id();
        //this.name = app.get_name();
        this._type = appType;
        this._panel = panel;

        this._stateChangedId = 0;
        this._countChangedId = 0;
        this._maxN = 4;
        this._settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        this._gDesktopInterfaceSettings = Convenience.getSettings('org.gnome.desktop.interface');

        this._iconContainer = new St.Widget({ layout_manager: new Clutter.BinLayout(),
                                              x_expand: true, y_expand: true });

        this.set_child(this._iconContainer);

        this._delegate = this;

        this._hasDndHover = false;
        this._folderPreviewId = 0;

        let iconParams = {
            setSizeManually: true,
            showLabel: false
        };
        iconParams['createIcon'] = this._createIcon.bind(this);

        this.icon = new IconGrid.BaseIcon(null, iconParams);
        this._iconSize = this._settings.get_double('shortcuts-panel-icon-size');
        this.icon.setIconSize(this._iconSize);
        this.icon.add_style_class_name('workspacestodock-shortcut-button-icon');
        if (this._type == ApplicationType.PLACE) {
            this.icon.add_style_class_name('workspacestodock-shortcut-button-symbolic-icon');
        }
        this._iconContainer.add_child(this.icon);

        this._dot = new St.Widget({
            style_class: 'app-well-app-running-dot',
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
        });
        this._iconContainer.add_child(this._dot);

        this.label_actor = this.icon.label;

        this._menu = null;
        this._menuManager = new PopupMenu.PopupMenuManager(this);

        if (this._type != ApplicationType.APPSBUTTON) {
            this._draggable = DND.makeDraggable(this);
            this._draggable.connect('drag-begin', () => {
                this._dragging = true;
                this.scaleAndFade();
                this._removeMenuTimeout();
                Main.overview.beginItemDrag(this);
            });
            this._draggable.connect('drag-cancelled', () => {
                this._dragging = false;
                Main.overview.cancelledItemDrag(this);
            });
            this._draggable.connect('drag-end', () => {
                this._dragging = false;
                this.undoScaleAndFade();
                Main.overview.endItemDrag(this);
            });
        }

        this._dragMonitor = null;
        this._itemDragBeginId = Main.overview.connect(
            'item-drag-begin', this._onDragBegin.bind(this));
        this._itemDragEndId = Main.overview.connect(
            'item-drag-end', this._onDragEnd.bind(this));

        this._menuTimeoutId = 0;
        this._stateChangedId = 0;
        if (this._type == ApplicationType.APPSBUTTON) {
            this._stateChangedId = Main.overview.viewSelector._showAppsButton.connect('notify::checked', () => {
                this._onStateChanged.bind(this);
            });
        } else if (this._type == ApplicationType.APPLICATION) {
            this._stateChangedId = this.app.connect('notify::state', () => {
                this._onStateChanged();
            });
            this._countChangedId = this.app.connect('windows-changed', () => {
                this._onCountChanged.bind(this);
            });
        }

        this._dot.opacity = 0;
        this._onStateChanged();

        this.connect('destroy', this._onDestroy.bind(this));
    }

    _onDestroy() {
        Main.overview.disconnect(this._itemDragBeginId);
        Main.overview.disconnect(this._itemDragEndId);

        if (this._stateChangedId > 0) {
            if (this._type == ApplicationType.APPSBUTTON) {
                Main.overview.viewSelector._showAppsButton.disconnect(this._stateChangedId);
            } else {
                this.app.disconnect(this._stateChangedId);
            }
        }
        this._stateChangedId = 0;

        if (this._countChangedId > 0) {
            if (this._type == ApplicationType.APPLICATION) {
                this.app.disconnect(this._countChangedId);
            }
        }
        this._countChangedId = 0;

        if (this._dragMonitor) {
            DND.removeDragMonitor(this._dragMonitor);
            this._dragMonitor = null;
        }

        if (this._draggable) {
            if (this._dragging)
                Main.overview.endItemDrag(this);
            this._draggable = null;
        }

        this._removeMenuTimeout();
    }

    _createIcon(iconSize) {
        if (this._type == ApplicationType.APPLICATION) {
            return this.app.create_icon_texture(iconSize);
        } else if (this._type == ApplicationType.PLACE) {
            // Adjust 'places' symbolic icons by reducing their size
            // and setting a special class for button padding
            this._iconSize -= 4;
            this.actor.add_style_class_name('workspacestodock-shortcut-button-symbolic');
            return new St.Icon({gicon: this.app.icon, icon_size: iconSize});
        } else if (this._type == ApplicationType.RECENT) {
            let gicon = Gio.content_type_get_icon(this.app.mime);
            return new St.Icon({gicon: gicon, icon_size: iconSize});
        } else if (this._type == ApplicationType.APPSBUTTON) {
            return new St.Icon({icon_name: 'view-app-grid-symbolic', icon_size: iconSize});
        }
    }

    _removeMenuTimeout() {
        if (this._menuTimeoutId > 0) {
            GLib.source_remove(this._menuTimeoutId);
            this._menuTimeoutId = 0;
        }
    }

    _onStateChanged() {
        if (this._type == ApplicationType.APPSBUTTON) {
            if (Main.overview.viewSelector._showAppsButton.checked) {
                this.add_style_pseudo_class('checked');
            } else {
                this.remove_style_pseudo_class('checked');
            }
        } else if (this._type == ApplicationType.APPLICATION) {
            if (this.app.state != Shell.AppState.STOPPED) {
                if (!this._settings.get_boolean('shortcuts-panel-show-window-count-indicators')) {
                    this._dot.opacity = 255;
                }
                this._onCountChanged();
            } else {
                this._dot.opacity = 0;
                this._onCountChanged();
            }
        }
    }

    _onCountChanged() {
        if (!this._settings.get_boolean('shortcuts-panel-show-window-count-indicators'))
            return;

        let appWindows = this.app.get_windows().filter((w) => {
            return !w.skip_taskbar;
        });

        let n = appWindows.length;
        if (n > this._maxN)
             n = this._maxN;

        for (let i = 1; i <= this._maxN; i++) {
            let className = 'workspacestodock-shortcut-button-windowcount-image-'+i;
            if (i != n) {
                this.remove_style_class_name(className);
            } else {
                this.add_style_class_name(className);
            }
        }
    }

    _setPopupTimeout() {
        this._removeMenuTimeout();
        this._menuTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MENU_POPUP_TIMEOUT, () => {
            this._menuTimeoutId = 0;
            this.popupMenu();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._menuTimeoutId, '[gnome-shell] this.popupMenu');
    }

    vfunc_leave_event(crossingEvent) {
        let ret = super.vfunc_leave_event(crossingEvent);

        this.fake_release();
        this._removeMenuTimeout();
        return ret;
    }

    vfunc_button_press_event(buttonEvent) {
        super.vfunc_button_press_event(buttonEvent);
        if (this._type == ApplicationType.APPSBUTTON || this._type == ApplicationType.APPLICATION) {
            if (buttonEvent.button == 1) {
                this._setPopupTimeout();
            } else if (buttonEvent.button == 3) {
                this.popupMenu();
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_touch_event(touchEvent) {
        super.vfunc_touch_event(touchEvent);
        if (touchEvent.type == Clutter.EventType.TOUCH_BEGIN)
            this._setPopupTimeout();

        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_clicked(button) {
        this._removeMenuTimeout();
        this.activate(button);
    }

    _onKeyboardPopupMenu() {
        this.popupMenu();
        this._menu.actor.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
    }

    getId() {
        return this.app.get_id();
    }

    popupMenu() {
        if (this._type != ApplicationType.APPSBUTTON && this._type != ApplicationType.APPLICATION)
             return false;

        this._removeMenuTimeout();
        this.fake_release();

        if (this._draggable)
            this._draggable.fakeRelease();

        if (!this._menu) {
            this._menu = new ShortcutButtonMenu(this);
            this._menu.connect('activate-window', (menu, window) => {
                this.activateWindow(window);
            });
            this._menu.connect('open-state-changed', (menu, isPoppedUp) => {
                if (!isPoppedUp)
                    this._onMenuPoppedDown();
            });
            let id = Main.overview.connect('hiding', () => {
                this._menu.close();
            });
            this.connect('destroy', () => {
                Main.overview.disconnect(id);
            });

            this._menuManager.addMenu(this._menu);
        }

        this.emit('menu-state-changed', true);

        this._panel.setPopupMenuFlag(true);
        this._panel.hideThumbnails();

        this.set_hover(true);
        this._menu.popup();
        this._menuManager.ignoreRelease();
        this.emit('sync-tooltip');

        return false;
    }

    activateWindow(metaWindow) {
        if (metaWindow)
            Main.activateWindow(metaWindow);
        else
            Main.overview.hide();
    }

    _onMenuPoppedDown() {
        this.sync_hover();
        this.emit('menu-state-changed', false);

        this._panel.setPopupMenuFlag(false);
        this._panel.showThumbnails();
    }

    activate(button) {
        let event = Clutter.get_current_event();
        let modifiers = event ? event.get_state() : 0;
        let isPrimaryButton = button && button == Clutter.BUTTON_PRIMARY;
        let isMiddleButton = button && button == Clutter.BUTTON_MIDDLE;
        let isCtrlPressed = (modifiers & Clutter.ModifierType.CONTROL_MASK) != 0;

        let openNewWindow = false;
        if (this._type == ApplicationType.APPLICATION) {
            openNewWindow = this.app.can_open_new_window() &&
                                this.app.state == Shell.AppState.RUNNING &&
                                (isCtrlPressed || isMiddleButton);
        }

        if (isPrimaryButton) {
            if (this._type == ApplicationType.APPLICATION) {
                // let tracker = Shell.WindowTracker.get_default();
                // if (this.app.state == Shell.AppState.RUNNING) {
                //     if (this.app == tracker.focus_app && !Main.overview._shown) {
                //         this._cycleThroughWindows();
                //     } else {
                //         // If we activate the app (this.app.activate), all app
                //         // windows will come to the foreground. We only want to
                //         // activate one window at a time
                //         let windows = getInterestingWindows(this.app);
                //         let w = windows[0];
                //         Main.activateWindow(w);
                //     }
                // } else {
                //     this.app.open_new_window(-1);
                // }
                if (this.app.state == Shell.AppState.STOPPED || openNewWindow)
                    this.animateLaunch();

                if (openNewWindow)
                    this.app.open_new_window(-1);
                else
                    this.app.activate();

                Main.overview.hide();
            } else if (this._type == ApplicationType.PLACE) {
                this.app.launch(global.get_current_time());
            } else if (this._type == ApplicationType.RECENT) {
                Gio.app_info_launch_default_for_uri(this.app.uri, global.create_app_launch_context());
            } else if (this._type == ApplicationType.APPSBUTTON) {
                if (Main.overview.visible) {
                    if (Main.overview.viewSelector._showAppsButton.checked) {
                        Main.overview.hide();
                        Main.overview.viewSelector._showAppsButton.checked = false;
                    } else {
                        Main.overview.viewSelector._showAppsButton.checked = true;
                    }
                } else {
                    // passingthru67: ISSUES #49 & #50
                    // Workaround issue by detecting animation status
                    // Showing the overview after checking the showAppsButton fails
                    // to animate when Gnome animations are enabled. On the other hand,
                    // showing the overview before checking the showAppsButton fails
                    // to scroll when Gnome animations are disabled.
                    if (this._gDesktopInterfaceSettings.get_boolean('enable-animations')) {
                        Main.overview.show();
                        Main.overview.viewSelector._showAppsButton.checked = true;
                    } else {
                        Main.overview.viewSelector._showAppsButton.checked = true;
                        Main.overview.show();
                    }
                }
            }
        } else if (isMiddleButton) {
            if (this._type == ApplicationType.APPLICATION) {
                this.app.open_new_window(-1);
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _cycleThroughWindows() {
        // Store for a little amount of time last time app was clicked
        // since the order changes upon window interaction
        let MEMORY_TIME = 3000;

        let appWindows = getInterestingWindows(this.app);

        if(recentlyClickedAppLoopId>0)
            GLib.source_remove(recentlyClickedAppLoopId);

        recentlyClickedAppLoopId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, MEMORY_TIME, this._resetClickedApp);

        // If there isn't already a list of windows for the current app,
        // or the stored list is outdated, use the current windows list.
        if (!recentlyClickedApp ||
            recentlyClickedApp.get_id() != this.app.get_id() ||
            recentlyClickedAppWindows.length != appWindows.length
          ) {

            recentlyClickedApp = this.app;
            recentlyClickedAppWindows = appWindows;
            recentlyClickedAppIndex = 0;
        }

        recentlyClickedAppIndex ++;
        let index = recentlyClickedAppIndex % recentlyClickedAppWindows.length;
        let window = recentlyClickedAppWindows[index];
        Main.activateWindow(window);
    }

    _resetClickedApp() {
        if(recentlyClickedAppLoopId>0)
            GLib.source_remove(recentlyClickedAppLoopId);

        recentlyClickedAppLoopId=0;
        recentlyClickedApp =null;
        recentlyClickedAppWindows = null;
        recentlyClickedAppIndex = 0;

        return false;
    }

    animateLaunch() {
        this.icon.animateZoomOut();
    }

    animateLaunchAtPos(x, y) {
        this.icon.animateZoomOutAtPos(x, y);
    }

    scaleIn() {
        this.scale_x = 0;
        this.scale_y = 0;

        this.ease({
            scale_x: 1,
            scale_y: 1,
            duration: APP_ICON_SCALE_IN_TIME,
            delay: APP_ICON_SCALE_IN_DELAY,
            mode: Clutter.AnimationMode.EASE_OUT_QUINT,
        });
    }

    shellWorkspaceLaunch(params) {
        let { stack } = new Error();
        log('shellWorkspaceLaunch is deprecated, use app.open_new_window() instead\n%s'.format(stack));

        params = Params.parse(params, { workspace: -1,
                                        timestamp: 0 });

        if (this._type == ApplicationType.APPLICATION) {
            this.app.open_new_window(params.workspace);
        } else if (this._type == ApplicationType.PLACE) {
            this.app.launch(global.get_current_time(), params.workspace);
        } else if (this._type == ApplicationType.RECENT) {
            Gio.app_info_launch_default_for_uri(this.app.uri, global.create_app_launch_context());
        } else if (this._type == ApplicationType.APPSBUTTON) {
            if (Main.overview.visible) {
                if (Main.overview.viewSelector._showAppsButton.checked) {
                    Main.overview.hide();
                    Main.overview.viewSelector._showAppsButton.checked = false;
                } else {
                    Main.overview.viewSelector._showAppsButton.checked = true;
                }
            } else {
                Main.overview.show();
                Main.overview.viewSelector._showAppsButton.checked = true;
            }
        }
    }

    getDragActor() {
        let appIcon;
        if (this._type == ApplicationType.APPLICATION) {
            appIcon = this.app.create_icon_texture(this._iconSize);
        } else if (this._type == ApplicationType.PLACE) {
            appIcon = new St.Icon({gicon: this.app.icon, icon_size: this._iconSize});
        } else if (this._type == ApplicationType.RECENT) {
            let gicon = Gio.content_type_get_icon(this.app.mime);
            appIcon = new St.Icon({gicon: gicon, icon_size: this._iconSize});
        } else if (this._type == ApplicationType.APPSBUTTON) {
            appIcon = new St.Icon({icon_name: 'view-app-grid-symbolic', icon_size: iconSize});
        }
        return appIcon;
    }

    // Returns the original actor that should align with the actor
    // we show as the item is being dragged.
    getDragActorSource() {
        return this.icon.icon;
    }

    shouldShowTooltip() {
        return this.hover && (!this._menu || !this._menu.isOpen);
    }

    scaleAndFade() {
        this.reactive = false;
        this.ease({
            scale_x: 0.75,
            scale_y: 0.75,
            opacity: 128,
        });
    }

    undoScaleAndFade() {
        this.reactive = true;
        this.ease({
            scale_x: 1.0,
            scale_y: 1.0,
            opacity: 255,
        });
    }

    _canAccept(source) {
        return false;

        // let view = _getViewFromIcon(source);
        //
        // return source != this &&
        //        (source instanceof this.constructor) &&
        //        (view instanceof AllView);
    }

    _setHoveringByDnd(hovering) {
        // if (hovering) {
        //     if (this._folderPreviewId > 0)
        //         return;
        //
        //     this._folderPreviewId =
        //         GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        //             this.add_style_pseudo_class('drop');
        //             this._showFolderPreview();
        //             this._folderPreviewId = 0;
        //             return GLib.SOURCE_REMOVE;
        //         });
        // } else {
        //     if (this._folderPreviewId > 0) {
        //         GLib.source_remove(this._folderPreviewId);
        //         this._folderPreviewId = 0;
        //     }
        //     this._hideFolderPreview();
        //     this.remove_style_pseudo_class('drop');
        // }
    }

    _onDragBegin() {
        this._dragMonitor = {
            dragMotion: this._onDragMotion.bind(this),
        };
        DND.addDragMonitor(this._dragMonitor);
    }

    _onDragMotion(dragEvent) {
        let target = dragEvent.targetActor;
        let isHovering = target == this || this.contains(target);
        let canDrop = this._canAccept(dragEvent.source);
        let hasDndHover = isHovering && canDrop;

        if (this._hasDndHover != hasDndHover) {
            // this._setHoveringByDnd(hasDndHover);
            this._hasDndHover = hasDndHover;
        }

        return DND.DragMotionResult.CONTINUE;
    }

    _onDragEnd() {
        this.remove_style_pseudo_class('drop');
        DND.removeDragMonitor(this._dragMonitor);
    }

    handleDragOver(source) {
        if (source == this)
            return DND.DragMotionResult.NO_DROP;

        if (!this._canAccept(source))
            return DND.DragMotionResult.CONTINUE;

        return DND.DragMotionResult.MOVE_DROP;
    }

    acceptDrop(source) {
        // this._setHoveringByDnd(false);

        if (!this._canAccept(source))
            return false;

        let view = _getViewFromIcon(this);
        let apps = [this.id, source.id];

        return view.createFolder(apps);
    }
});

var ShortcutButtonMenu = class WorkspacesToDock_ShortcutButtonMenu extends PopupMenu.PopupMenu {
    constructor(source) {
        let settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        let side = getPosition(settings);

        super(source, 0.5, side);
        this._settings = settings;

        // We want to keep the item hovered while the menu is up
        this.blockSourceEvents = true;

        this._source = source;

        this.actor.add_style_class_name('app-well-menu');

        // Chain our visibility and lifecycle to that of the source
        this._sourceMappedId = source.connect('notify::mapped', () => {
            if (!source.mapped)
                this.close();
        });
        source.connect('destroy', () => {
            source.disconnect(this._sourceMappedId);
            this.destroy();
        });

        Main.uiGroup.add_actor(this.actor);
    }

    _redisplay() {
        this.removeAll();

        // passingthru67: appsbutton menu to show extension preferences
        if (this._source._type == ApplicationType.APPSBUTTON) {
            let item = this._appendMenuItem(_("Extension Preferences"));
            item.connect('activate', () => {
                // passingthru67: Should we use commandline or argv?
                // Util.trySpawnCommandLine("gnome-shell-extension-prefs " + Me.metadata.uuid);
                Util.spawn(["gnome-shell-extension-prefs", Me.metadata.uuid]);
            });
            return;
        }

        let windows = this._source.app.get_windows().filter(
            w => !w.skip_taskbar
        );

        if (windows.length > 0) {
            this.addMenuItem(
                /* Translators: This is the heading of a list of open windows */
                new PopupMenu.PopupSeparatorMenuItem(_("Open Windows"))
            );
        }

        windows.forEach(window => {
            let title = window.title
                ? window.title : this._source.app.get_name();
            let item = this._appendMenuItem(title);
            item.connect('activate', () => {
                this.emit('activate-window', window);
            });
        });

        if (!this._source.app.is_window_backed()) {
            this._appendSeparator();

            let appInfo = this._source.app.get_app_info();
            let actions = appInfo.list_actions();
            if (this._source.app.can_open_new_window() &&
                !actions.includes('new-window')) {
                this._newWindowMenuItem = this._appendMenuItem(_("New Window"));
                this._newWindowMenuItem.connect('activate', () => {
                    this._source.animateLaunch();
                    this._source.app.open_new_window(-1);
                    this.emit('activate-window', null);
                });
                this._appendSeparator();
            }

            // if (discreteGpuAvailable &&
            //     this._source.app.state == Shell.AppState.STOPPED) {
            //     this._onDiscreteGpuMenuItem = this._appendMenuItem(_("Launch using Dedicated Graphics Card"));
            //     this._onDiscreteGpuMenuItem.connect('activate', () => {
            //         this._source.animateLaunch();
            //         this._source.app.launch(0, -1, true);
            //         this.emit('activate-window', null);
            //     });
            // }

            for (let i = 0; i < actions.length; i++) {
                let action = actions[i];
                let item = this._appendMenuItem(appInfo.get_action_name(action));
                item.connect('activate', (emitter, event) => {
                    if (action == 'new-window')
                        this._source.animateLaunch();

                    this._source.app.launch_action(action, event.get_time(), -1);
                    this.emit('activate-window', null);
                });
            }

            let canFavorite = global.settings.is_writable('favorite-apps');

            if (canFavorite) {
                this._appendSeparator();

                let isFavorite = AppFavorites.getAppFavorites().isFavorite(this._source.app.get_id());

                if (isFavorite) {
                    let item = this._appendMenuItem(_("Remove from Favorites"));
                    item.connect('activate', () => {
                        let favs = AppFavorites.getAppFavorites();
                        favs.removeFavorite(this._source.app.get_id());
                    });
                } else {
                    let item = this._appendMenuItem(_("Add to Favorites"));
                    item.connect('activate', () => {
                        let favs = AppFavorites.getAppFavorites();
                        favs.addFavorite(this._source.app.get_id());
                    });
                }
            }

            if (Shell.AppSystem.get_default().lookup_app('org.gnome.Software.desktop')) {
                this._appendSeparator();
                let item = this._appendMenuItem(_("Show Details"));
                item.connect('activate', () => {
                    let id = this._source.app.get_id();
                    let args = GLib.Variant.new('(ss)', [id, '']);
                    Gio.DBus.get(Gio.BusType.SESSION, null, (o, res) => {
                        let bus = Gio.DBus.get_finish(res);
                        bus.call('org.gnome.Software',
                                 '/org/gnome/Software',
                                 'org.gtk.Actions', 'Activate',
                                 GLib.Variant.new('(sava{sv})',
                                                  ['details', [args], null]),
                                 null, 0, -1, null, null);
                        Main.overview.hide();
                    });
                });
            }
        }
    }

    _appendSeparator() {
        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this.addMenuItem(separator);
    }

    _appendMenuItem(labelText) {
        // FIXME: app-well-menu-item style
        let item = new PopupMenu.PopupMenuItem(labelText);
        this.addMenuItem(item);
        return item;
    }

    popup(_activatingButton) {
        this._redisplay();

        if (this._settings.get_boolean('shortcuts-panel-popupmenu-arrow-at-top')) {
            this._arrowAlignment = 0.0;
        } else {
            this._arrowAlignment = 0.5;
        }

        this.open();
    }
};
Signals.addSignalMethods(ShortcutButtonMenu.prototype);

var ShortcutsPanel = class WorkspacesToDock_ShortcutsPanel {
    constructor(dock) {
        this._dock = dock;
        this._settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        this._position = getPosition(this._settings);
        this._isHorizontal = (this._position == St.Side.TOP ||
                              this._position == St.Side.BOTTOM);

        let packVertical = true;
        if (this._isHorizontal)
            packVertical = false;

        // Set _centerContainer property
        if (this._settings.get_boolean('customize-height') && this._settings.get_boolean('center-thumbnails-on-dock')) {
            this._centerContainer = true;
        } else {
            this._centerContainer = false;
        }

        // Set _centerPanelsIndependently property
        if (this._centerContainer && this._settings.get_int('center-thumbnails-option') == 0) {
            this._centerPanelsIndependently = true;
        } else {
            this._centerPanelsIndependently = false;
        }

        this.actor = new St.BoxLayout({
            style_class: 'workspace-thumbnails workspacestodock-shortcuts-panel',
            vertical: packVertical,
            clip_to_allocation: true,
            x_align: (this._centerContainer && this._centerPanelsIndependently) ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START,
            y_align: (this._centerContainer && this._centerPanelsIndependently) ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START
        });
        this.actor._delegate = this;

        this._appSystem = Shell.AppSystem.get_default();
        this._appFavorites = AppFavorites.getAppFavorites();

        this._installedChangedId = this._appSystem.connect('installed-changed', () =>  {
            this._appFavorites.reload();
            this.refresh();
        });

        // Connect to AppSystem and listen for app state changes
        this._appStateChangedId = this._appSystem.connect('app-state-changed', this._updateRunningApps.bind(this));

        // Connect to AppFavorites and listen for favorites changes
        this._favoritesChangedId = this._appFavorites.connect('changed', this._queueUpdateFavoriteApps.bind(this));

        // Connect to item drag signals
        this._dragPlaceholder = null;
        this._dragPlaceholderPos = -1;
        this._itemDragBeginId = Main.overview.connect('item-drag-begin', this._onDragBegin.bind(this));
        this._itemDragEndId = Main.overview.connect('item-drag-end', this._onDragEnd.bind(this));
        this._itemDragCancelId = Main.overview.connect('item-drag-cancelled', this._onDragCancelled.bind(this));

        // Bind Preference Settings
        this._bindSettingsChanges();

        // Populate panel
        this._populate();
    }

    destroy() {
        if (_DEBUG_) global.log("shortcutsPanel: destroying * * * * *");

        if (_DEBUG_) global.log("shortcutsPanel: disconnect signals");
        // Disconnect global signals
        if (this._itemDragBeginId > 0) Main.overview.disconnect(this._itemDragBeginId);
        if (this._itemDragEndId > 0) Main.overview.disconnect(this._itemDragEndId);
        if (this._itemDragCancelId > 0) Main.overview.disconnect(this._itemDragCancelId);
        if (this._installedChangedId > 0) this._appSystem.disconnect(this._installedChangedId);
        if (this._appStateChangedId > 0) this._appSystem.disconnect(this._appStateChangedId);
        if (this._favoritesChangedId > 0) this._appFavorites.disconnect(this._favoritesChangedId);

        if (_DEBUG_) global.log("shortcutsPanel: destroy main actor");
        // Destroy main clutter actor
        this.actor.destroy_all_children();
        this.actor.destroy();

        if (_DEBUG_) global.log("shortcutsPanel: dispose settings");
        // Disconnect GSettings signals
        this._settings.run_dispose();
    }

    _bindSettingsChanges() {
        this._settings.connect('changed::shortcuts-panel-show-running', () =>  {
            this.refresh();
        });
        this._settings.connect('changed::shortcuts-panel-show-places', () =>  {
            this.refresh();
        });
        this._settings.connect('changed::shortcuts-panel-show-window-count-indicators', () =>  {
            this.refresh();
        });
        this._settings.connect('changed::shortcuts-panel-appsbutton-at-bottom', () =>  {
            this.refresh();
        });
    }

    _onDragBegin() {
        this._dragCancelled = false;
        this._dragMonitor = {
            dragMotion: this._onDragMotion.bind(this)
        };
        DND.addDragMonitor(this._dragMonitor);
    }

    _onDragCancelled() {
        this._dragCancelled = true;
        this._endDrag();
    }

    _onDragEnd() {
        if (this._dragCancelled)
            return;

        this._endDrag();
    }

    _endDrag() {
        this._clearDragPlaceholder();
        DND.removeDragMonitor(this._dragMonitor);
    }

    _onDragMotion(dragEvent) {
        let app = getAppFromSource(dragEvent.source);
        if (app == null)
            return DND.DragMotionResult.CONTINUE;

        if (!this.actor.contains(dragEvent.targetActor))
            this._clearDragPlaceholder();

        return DND.DragMotionResult.CONTINUE;
    }

    _clearDragPlaceholder() {
        if (this._dragPlaceholder) {
            this._dragPlaceholder.destroy();
            this._dragPlaceholder = null;
        }
        this._dragPlaceholderPos = -1;
    }

    handleDragOver(source, actor, x, y, time) {
        let app = getAppFromSource(source);

        // Don't allow favoriting of transient apps
        if (app == null || app.is_window_backed())
            return DND.DragMotionResult.NO_DROP;

        if (!global.settings.is_writable('favorite-apps'))
            return DND.DragMotionResult.NO_DROP;

        let favorites = AppFavorites.getAppFavorites().getFavorites();
        let numFavorites = favorites.length;

        let favPos = favorites.indexOf(app);

        let children = this._favoriteAppsBox.get_children();
        let numChildren = children.length;
        let boxH;
        let boxY;
        if (this._isHorizontal) {
            boxY = this._favoriteAppsBox.x;
            boxH = this._favoriteAppsBox.width;
        } else {
            boxY = this._favoriteAppsBox.y;
            boxH = this._favoriteAppsBox.height;
        }

        // Keep the placeholder out of the index calculation; assuming that
        // the remove target has the same size as "normal" items, we don't
        // need to do the same adjustment there.
        if (this._dragPlaceholder) {
            if (this._isHorizontal) {
                boxH -= this._dragPlaceholder.width;
            } else {
                boxH -= this._dragPlaceholder.height;
            }
            numChildren--;
        }

        let pos;
        let posY;
        if (this._isHorizontal) {
            posY = x - boxY;
        } else {
            posY = y - boxY;
        }
        pos = Math.floor(posY * numChildren / boxH);

        if (pos != this._dragPlaceholderPos && pos <= numFavorites) {
            this._dragPlaceholderPos = pos;

            // Don't allow positioning before or after self
            if (favPos != -1 && (pos == favPos || pos == favPos + 1)) {
                this._clearDragPlaceholder();
                return DND.DragMotionResult.CONTINUE;
            }

            // If the placeholder already exists, we just move
            // it, but if we are adding it, expand its size in
            // an animation
            // Passingthru67 TODO:
            // Need to convert the dragPlaceholder to an St.Widget so that
            // we can use the fadein animation
            let fadeIn;
            if (this._dragPlaceholder) {
                this._dragPlaceholder.destroy();
                fadeIn = false;
            } else {
                fadeIn = true;
            }

            this._dragPlaceholder = new MyDragPlaceholderItem();
            this._favoriteAppsBox.insert_child_at_index(this._dragPlaceholder,
                                            this._dragPlaceholderPos);
            // this._dragPlaceholder.show(fadeIn);
            this._dragPlaceholder.show();
        }

        // Remove the drag placeholder if we are not in the
        // "favorites zone"
        if (pos > numFavorites)
            this._clearDragPlaceholder();

        if (!this._dragPlaceholder)
            return DND.DragMotionResult.NO_DROP;

        let srcIsFavorite = (favPos != -1);
        if (srcIsFavorite) {
            return DND.DragMotionResult.MOVE_DROP;
        }

        return DND.DragMotionResult.COPY_DROP;
    }

    // Draggable target interface
    acceptDrop(source, actor, x, y, time) {
        let app = getAppFromSource(source);

        // Don't allow favoriting of transient apps
        if (app == null || app.is_window_backed()) {
            return false;
        }

        if (!global.settings.is_writable('favorite-apps'))
            return false;

        let id = app.get_id();

        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

        let srcIsFavorite = (id in favorites);

        let favPos = 0;
        let children = this._favoriteAppsBox.get_children();
        for (let i = 0; i < this._dragPlaceholderPos; i++) {
            if (this._dragPlaceholder &&
                children[i] == this._dragPlaceholder)
                continue;

            let childId = children[i]._delegate.app.get_id();
            if (childId == id) {
                continue;
            }
            if (childId in favorites) {
                favPos++;
            }
        }

        // No drag placeholder means we don't wan't to favorite the app
        // and we are dragging it to its original position
        if (!this._dragPlaceholder)
            return true;

        Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
                let appFavorites = AppFavorites.getAppFavorites();
                if (srcIsFavorite)
                    appFavorites.moveFavoriteToPos(id, favPos);
                else
                    appFavorites.addFavoriteAtPos(id, favPos);
                return false;
            });

        this._clearDragPlaceholder();
        return true;
    }

    setPopupMenuFlag(showing) {
        this._dock.setPopupMenuFlag(showing);
    }

    hideThumbnails() {
        if (this._settings.get_boolean('shortcuts-panel-popupmenu-hide-thumbnails')) {
            if (this._settings.get_enum('shortcuts-panel-orientation') == ShortcutsPanelOrientation.OUTSIDE) {
                this._dock._thumbnailsBox.actor.opacity = 0;
                this.actor.remove_style_class_name('workspacestodock-shortcuts-panel');
                this.actor.add_style_class_name('workspacestodock-shortcuts-panel-popupmenu');
                // for (let i = 0; i < this._dock._thumbnailsBox._thumbnails.length; i++) {
                //     this._dock._thumbnailsBox._thumbnails[i].actor.opacity = 0;
                // }
                // this._dock._thumbnailsBox._indicator.opacity = 0;
            }
        }
    }

    showThumbnails() {
        if (this._settings.get_boolean('shortcuts-panel-popupmenu-hide-thumbnails')) {
            this._dock._thumbnailsBox.actor.opacity = 255;
            this.actor.remove_style_class_name('workspacestodock-shortcuts-panel-popupmenu');
            this.actor.add_style_class_name('workspacestodock-shortcuts-panel');
            // for (let i = 0; i < this._dock._thumbnailsBox._thumbnails.length; i++) {
            //     this._dock._thumbnailsBox._thumbnails[i].actor.opacity = 255;
            // }
            // this._dock._thumbnailsBox._indicator.opacity = 255;
        }
    }

    setReactiveState(state) {
        if (state == null)
            return;

        // Deactive Apps button
        this._appsButton.reactive = state;

        // Deactivate favorites
        if (this._favoriteAppsBox) {
            let children = this._favoriteAppsBox.get_children();
            for (let i = 0; i < children.length; i++) {
                children[i].reactive = state;
            }
        }

        // Deactivate running apps
        if (this._runningAppsBox) {
            let children = this._runningAppsBox.get_children();
            for (let i = 0; i < children.length; i++) {
                children[i].reactive = state;
            }
        }

        // Deactivate places
        if (this._placesBox) {
            let children = this._placesBox.get_children();
            for (let i = 0; i < children.length; i++) {
                children[i].reactive = state;
            }
        }
    }

    refresh() {
        this._clear();
        this._populate();
    }

    _clear() {
        this.actor.destroy_all_children();
    }

    _populate() {
        let packVertical = true;
        if (this._isHorizontal)
            packVertical = false;

        // Add Favorite Apps Box
        this._favoriteAppsBox = new St.BoxLayout({
            vertical: packVertical,
            style_class: 'workspacestodock-shortcuts-panel workspacestodock-shortcuts-panel-favorites'
        });
        this.actor.add_actor(this._favoriteAppsBox);
        this._favoriteAppsWorkId = Main.initializeDeferredWork(this._favoriteAppsBox, this._updateFavoriteApps.bind(this));

        // Add Running Apps Box
        if (this._settings.get_boolean('shortcuts-panel-show-running')) {
            this._runningAppsBox = new St.BoxLayout({
                vertical: packVertical,
                style_class: 'workspacestodock-shortcuts-panel workspacestodock-shortcuts-panel-running'
            });
            this.actor.add_actor(this._runningAppsBox);
            this._updateRunningApps();
        }

        if (this._settings.get_boolean('shortcuts-panel-show-places')) {
            this._placesBox = new St.BoxLayout({
                vertical: packVertical,
                style_class: 'workspacestodock-shortcuts-panel workspacestodock-shortcuts-panel-places'
            });
            this.actor.add_actor(this._placesBox);

            // Get places
            let placesManager = new PlaceDisplay.PlacesManager();
            let special = placesManager.get('special');

            let allPlaces = [];
            allPlaces = allPlaces.concat(special);

            // Add places to Places Box
            for (let i = 0; i < allPlaces.length; ++i) {
                let app = allPlaces[i];
                let shortcutButton = new ShortcutButton(app, ApplicationType.PLACE);
                this._placesBox.add_actor(shortcutButton);
            }
        }

        // Add Apps Button to top or bottom of shortcuts panel
        this._appsButton = new ShortcutButton(null, ApplicationType.APPSBUTTON, this);
        if (this._settings.get_boolean('shortcuts-panel-appsbutton-at-bottom')) {
            let filler = new St.Widget({
                style_class: 'popup-separator-menu-item workspacestodock-shortcut-panel-filler',
                x_expand: true,
                y_expand: true
            });
            this.actor.add_actor(filler);
            this.actor.add_actor(this._appsButton);
        } else {
            this.actor.insert_child_at_index(this._appsButton, 0);
        }
    }

    _queueUpdateFavoriteApps () {
        Main.queueDeferredWork(this._favoriteAppsWorkId);
    }

    _updateFavoriteApps() {
        if (_DEBUG_) global.log("shortcutsPanel: _updateFavoriteApps");
        if (!this._favoriteAppsBox)
            return;

        if (_DEBUG_) global.log("shortcutsPanel: ... favoriteAppsBox exists so continue");
        // Clear favorite apps box
        this._favoriteAppsBox.destroy_all_children();

        // Apps supposed to be in the favorite apps box
        let newApps = [];

        // Get favorites
        let favorites = this._appFavorites.getFavoriteMap();
        for (let id in favorites) {
            newApps.push(favorites[id]);
        }

        // Populate shortcuts panel with favorites
        for (let i = 0; i < newApps.length; ++i) {
            let app = newApps[i];
            let shortcutButton = new ShortcutButton(app, ApplicationType.APPLICATION, this);
            this._favoriteAppsBox.add_actor(shortcutButton);
        }

        this.emit('update-favorite-apps');
        this._updateRunningApps();
    }

    _updateRunningApps() {
        if (_DEBUG_) global.log("shortcutsPanel: _updateRunningApps");
        if (!this._runningAppsBox)
            return;

        if (_DEBUG_) global.log("shortcutsPanel: ... runningAppsBox exists so continue");
        let children = this._runningAppsBox.get_children().filter((actor) => {
                return actor &&
                      actor._delegate &&
                      actor._delegate.app && actor._delegate._type == ApplicationType.APPLICATION;
            });

        // Apps currently in running apps box
        let oldApps = children.map(function(actor) {
            return actor._delegate.app;
        });

        // Apps supposed to be in the running apps box
        let newApps = [];

        // Get favorites
        let favorites = this._appFavorites.getFavoriteMap();

        // Get running apps
        let running = this._appSystem.get_running();
        for (let i = 0; i < running.length; i++) {
            let app = running[i];
            if (app.get_id() in favorites)
                continue;
            newApps.push(app);
        }

        // Figure out the actual changes to the list of items; we iterate
        // over both the list of items currently in the dash and the list
        // of items expected there, and collect additions and removals.
        // Moves are both an addition and a removal, where the order of
        // the operations depends on whether we encounter the position
        // where the item has been added first or the one from where it
        // was removed.
        // There is an assumption that only one item is moved at a given
        // time; when moving several items at once, everything will still
        // end up at the right position, but there might be additional
        // additions/removals (e.g. it might remove all the launchers
        // and add them back in the new order even if a smaller set of
        // additions and removals is possible).
        // If above assumptions turns out to be a problem, we might need
        // to use a more sophisticated algorithm, e.g. Longest Common
        // Subsequence as used by diff.
        let addedItems = [];
        let removedActors = [];

        let newIndex = 0;
        let oldIndex = 0;
        while (newIndex < newApps.length || oldIndex < oldApps.length) {
            let oldApp = oldApps.length > oldIndex ? oldApps[oldIndex] : null;
            let newApp = newApps.length > newIndex ? newApps[newIndex] : null;

            // No change at oldIndex/newIndex
            if (oldApp == newApp) {
                oldIndex++;
                newIndex++;
                continue;
            }

            // App removed at oldIndex
            if (oldApp && newApps.indexOf(oldApp) == -1) {
                removedActors.push(children[oldIndex]);
                oldIndex++;
                continue;
            }

            // App added at newIndex
            if (newApp && oldApps.indexOf(newApp) == -1) {
                addedItems.push({ app: newApp,
                                  item: this._createShortcutButton(newApp, ApplicationType.APPLICATION),
                                  pos: newIndex });
                newIndex++;
                continue;
            }

            // App moved
            let nextApp = newApps.length > newIndex + 1 ? newApps[newIndex + 1]
                                                        : null;
            let insertHere = nextApp && nextApp == oldApp;
            let alreadyRemoved = removedActors.reduce((result, actor) => {
                let removedApp = actor.child._delegate.app;
                return result || removedApp == newApp;
            }, false);

            if (insertHere || alreadyRemoved) {
                let newItem = this._createShortcutButton(newApp, shortcutType);
                addedItems.push({ app: newApp,
                                  item: newItem,
                                  pos: newIndex + removedActors.length });
                newIndex++;
            } else {
                removedActors.push(children[oldIndex]);
                oldIndex++;
            }
        }

        for (let i = 0; i < addedItems.length; i++)
            this._runningAppsBox.insert_child_at_index(addedItems[i].item,
                                            addedItems[i].pos);

        for (let i = 0; i < removedActors.length; i++) {
            let item = removedActors[i];
            item.destroy();
        }

        this.emit('update-running-apps');
    }

    _createShortcutButton(app, appType) {
        let shortcutType = app ? appType : ApplicationType.APPSBUTTON;
        let shortcutButton = new ShortcutButton(app, shortcutType, this);
        return shortcutButton;
    }
};
Signals.addSignalMethods(ShortcutsPanel.prototype);
