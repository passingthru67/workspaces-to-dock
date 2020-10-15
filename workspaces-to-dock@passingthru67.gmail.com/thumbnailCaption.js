const _DEBUG_ = false;

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const St = imports.gi.St;
const Graphene = imports.gi.Graphene;

const Main = imports.ui.main;
const WorkspacesView = imports.ui.workspacesView;
const Workspace = imports.ui.workspace;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;
const Overview = imports.ui.overview;
const IconGrid = imports.ui.iconGrid;
const PopupMenu = imports.ui.popupMenu;
const DND = imports.ui.dnd;

const Util = imports.misc.util;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const MyWorkspaceThumbnail = Me.imports.myWorkspaceThumbnail;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

var CAPTION_APP_ICON_ZOOM = 8;
let TASKBAR_TOOLTIP_SHOW_TIME = 150;
let TASKBAR_TOOLTIP_HIDE_TIME = 100;
let TASKBAR_TOOLTIP_HOVER_TIMEOUT = 10;

const WindowAppsUpdateAction = {
    ADD: 0,
    REMOVE: 1,
    CLEARALL: 2
};

const CaptionPosition = {
    BOTTOM: 0,
    TOP: 1
};

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


var TaskbarIcon = GObject.registerClass({},
class WorkspacesToDock_TaskbarIcon extends GObject.Object {
    _init(app, metaWin, caption) {
        this._caption = caption;
        this._mySettings = caption._mySettings;
        this._app = app;
        this._metaWin = metaWin;

        if (this._mySettings.get_enum('workspace-caption-position') == CaptionPosition.TOP) {
            this._captionYAlign = Clutter.ActorAlign.START;
        } else {
            this._captionYAlign = Clutter.ActorAlign.END;
        }

        let iconParams = {setSizeManually: true, showLabel: false};
        iconParams['createIcon'] = (iconSize) => { return app.create_icon_texture(iconSize);};

        this._icon = new IconGrid.BaseIcon(app.get_name(), iconParams);
        this._icon.add_style_class_name('workspacestodock-caption-windowapps-button-icon');
        this._iconSize = this._mySettings.get_double('workspace-caption-taskbar-icon-size');
        this._icon.setIconSize(this._mySettings.get_double('workspace-caption-taskbar-icon-size'));

        this.actor = new St.Button({
            style_class:'workspacestodock-caption-windowapps-button',
            x_align: Clutter.ActorAlign.START,
            y_align: this._captionYAlign
        });
        this.actor.set_child(this._icon);
        this.actor._delegate = this;

        // this._tooltipText = this._app.get_name();
        this._tooltipHoverTimeoutId = 0;
        this._tooltipText = this._metaWin.title;
        this.tooltip = new St.Label({ style_class: 'dash-label workspacestodock-caption-windowapps-button-tooltip'});
        this.tooltip.hide();
        Main.layoutManager.addChrome(this.tooltip);
        Main.layoutManager.uiGroup.set_child_below_sibling(this.tooltip, Main.layoutManager.modalDialogGroup);
        this.tooltip_actor = this.tooltip;

        // Connect signals
        this.actor.connect('button-release-event', this._onButtonRelease.bind(this));
        this.actor.connect('enter-event', this._onButtonEnter.bind(this));
        this.actor.connect('leave-event', this._onButtonLeave.bind(this));
        this.actor.connect('destroy', this._onDestroy.bind(this));

        // Make actor draggable
        this._draggable = DND.makeDraggable(this.actor);
    }

    _onDestroy() {
        this.tooltip.hide();
        this.tooltip.destroy();
    }

    _onButtonEnter(actor, event) {
        if (_DEBUG_) global.log("TaskbarIcon: _onButtonEnter");
        let icon = actor._delegate._icon;
        let zoomSize = this._mySettings.get_double('workspace-caption-taskbar-icon-size') + CAPTION_APP_ICON_ZOOM;
        icon.setIconSize(zoomSize);

        if (this._mySettings.get_boolean('workspace-caption-taskbar-tooltips')) {
            if (this._tooltipHoverTimeoutId > 0) {
                GLib.source_remove(this._tooltipHoverTimeoutId);
                this._tooltipHoverTimeoutId = 0;
            }
            this._tooltipHoverTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TASKBAR_TOOLTIP_HOVER_TIMEOUT, this.showTooltip.bind(this));
        }
    }

    _onButtonLeave(actor, event) {
        if (_DEBUG_) global.log("TaskbarIcon: _onButtonLeave");
        let icon = actor._delegate._icon;
        icon.setIconSize(this._mySettings.get_double('workspace-caption-taskbar-icon-size'));

        this.hideTooltip();
    }

    _onButtonRelease(actor, event) {
        let mouseButton = event.get_button();
        if (mouseButton == 1) {
            if (this._caption._menu.isOpen) {
                this._caption._menu.close();
            }
            this._caption.activateMetaWindow(this._metaWin);
        }
        if (mouseButton == 2) {
            this._caption.closeMetaWindow(this._metaWin);
        }

        this.hideTooltip();
        return Clutter.EVENT_PROPAGATE;
    }

    getDragActor() {
        this.hideTooltip();
        return this._app.create_icon_texture(this._iconSize);
    }

    // Returns the original actor that should align with the actor
    // we show as the item is being dragged.
    getDragActorSource() {
        this.hideTooltip();
        return this._icon;
    }

    showTooltip() {
        if (this._tooltipHoverTimeoutId > 0) {
            GLib.source_remove(this._tooltipHoverTimeoutId);
            this._tooltipHoverTimeoutId = 0;
        }

        if (!this._tooltipText)
            return;

        this._tooltipText = this._metaWin.title;
        this.tooltip.set_text(this._tooltipText);
        this.tooltip.opacity = 0;
        this.tooltip.show();

        let [buttonStageX, buttonStageY] = this.actor.get_transformed_position();
        let labelWidth = this.tooltip.get_width();
        let buttonWidth = this.actor.get_width();
        let x = buttonStageX + (buttonWidth / 2) - (labelWidth / 2);
        let labelHeight = this.tooltip.get_height();
        let y = buttonStageY - labelHeight;

        // Get monitor screen info
        let preferredMonitorIndex = this._mySettings.get_int('preferred-monitor');
        let monitorIndex = (Main.layoutManager.primaryIndex + preferredMonitorIndex) % Main.layoutManager.monitors.length ;
        let monitor = Main.layoutManager.monitors[monitorIndex];

        // Check that tooltip is not off screen
        // Correct tooltip position if necessary
        let position = getPosition(this._mySettings);
        if (position == St.Side.LEFT) {
            if (x < monitor.x)
                x = monitor.x;
        }
        if (position == St.Side.RIGHT) {
            if ((x + labelWidth) > (monitor.x + monitor.width))
                x = (monitor.x + monitor.width) - labelWidth;
        }
        if (position == St.Side.TOP || position == St.Side.BOTTOM) {
            if (x < monitor.x)
                x = monitor.x;

            if ((x + labelWidth) > (monitor.x + monitor.width))
                x = (monitor.x + monitor.width) - labelWidth;
        }

        this.tooltip.set_position(x, y);
        this.tooltip.ease({
            opacity: 255,
            duration: TASKBAR_TOOLTIP_SHOW_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
    }

    hideTooltip() {
        if (this._tooltipHoverTimeoutId > 0) {
            GLib.source_remove(this._tooltipHoverTimeoutId);
            this._tooltipHoverTimeoutId = 0;
        }

        this.tooltip.ease({
            opacity: 0,
            duration: TASKBAR_TOOLTIP_HIDE_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                this.tooltip.hide();
            }
        });
    }
});

var MenuTaskListItem = class WorkspacesToDock_MenuTaskListItem {
    constructor(app, metaWin, caption) {
        this._metaWin = metaWin;
        this._caption = caption;
        this._mySettings = caption._mySettings;

        let iconParams = {setSizeManually: true, showLabel: false};
        iconParams['createIcon'] = (iconSize) => { return app.create_icon_texture(iconSize);};

        this._icon = new IconGrid.BaseIcon(app.get_name(), iconParams);
        this._icon.add_style_class_name('workspacestodock-caption-windowapps-menu-icon');
        this._icon.setIconSize(this._mySettings.get_double('workspace-caption-menu-icon-size'));
        // this._label = new St.Label({ text: app.get_name(), style_class: 'workspacestodock-caption-windowapps-menu-label' });
        this._label = new St.Label({
            text: this._metaWin.title,
            style_class: 'workspacestodock-caption-windowapps-menu-label',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });

        this._buttonBox = new St.BoxLayout({
            style_class:'workspacestodock-caption-windowapps-menu-button',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        this._buttonBox.add_actor(this._icon);
        this._buttonBox.add_actor(this._label);

        this._closeButton = new St.Button({
            style_class:'workspacestodock-caption-windowapps-menu-close',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER
        });
        // this._closeButton.add_style_class_name('window-close');
        this._closeIcon = new St.Icon({ icon_name: 'window-close-symbolic', style_class: 'popup-menu-icon' });
        this._closeButton.set_size(this._mySettings.get_double('workspace-caption-menu-icon-size'), this._mySettings.get_double('workspace-caption-menu-icon-size'));
        this._closeButton.set_child(this._closeIcon);

        this.actor = new St.BoxLayout({
            reactive: true,
            style_class: 'popup-menu-item workspacestodock-caption-windowapps-menu-item'
        });
        this.actor._delegate = this;

        this._ornament = 0;
        this._ornamentLabel = new St.Label({ style_class: 'popup-menu-ornament' });
        this.actor.add_actor(this._ornamentLabel);
        this.actor.add_actor(this._buttonBox);
        this.actor.add_actor(this._closeButton);

        // Connect signals
        this._closeButton.connect('button-release-event', this._onCloseButtonRelease.bind(this));
        this.actor.connect('button-release-event', this._onButtonRelease.bind(this));
        this.actor.connect('enter-event', this._onItemEnter.bind(this));
        this.actor.connect('leave-event', this._onItemLeave.bind(this));
    }

    _onItemEnter(actor, event) {
        if (_DEBUG_) global.log("MenuTaskListItem: _onButtonEnter");
        this.actor.add_style_pseudo_class('active');
    }

    _onItemLeave(actor, event) {
        if (_DEBUG_) global.log("MenuTaskListItem: _onButtonLeave");
        this.actor.remove_style_pseudo_class('active');
    }

    _onButtonRelease(actor, event) {
        let mouseButton = event.get_button();
        if (mouseButton == 1) {
            this._caption.activateMetaWindow(this._metaWin);
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _onCloseButtonRelease(actor, event) {
        let mouseButton = event.get_button();
        if (mouseButton == 1) {
            this._caption.closeMetaWindow(this._metaWin);
        }
        return Clutter.EVENT_PROPAGATE;
    }
};

var ThumbnailCaption = class WorkspacesToDock_ThumbnailCaption {
    constructor(thumbnail) {
        this._thumbnail = thumbnail;
        this._settings = new Gio.Settings({ schema: MyWorkspaceThumbnail.MUTTER_SCHEMA });
        this._mySettings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        this._position = getPosition(this._mySettings);
        this._isHorizontal = (this._position == St.Side.TOP ||
                              this._position == St.Side.BOTTOM);

        if (this._mySettings.get_enum('workspace-caption-position') == CaptionPosition.TOP) {
            this._captionYAlign = Clutter.ActorAlign.START;
        } else {
            this._captionYAlign = Clutter.ActorAlign.END;
        }

        this.actor = new St.Bin({
            name: 'workspacestodockCaptionContainer',
            reactive: false,
            style_class: 'workspacestodock-workspace-caption-container',
            y_align: this._captionYAlign,
            x_align: Clutter.ActorAlign.START
        });

        this._wsCaptionBackground = new St.Bin({
            name: 'workspacestodockCaptionBackground',
            reactive: false,
            style_class: 'workspacestodock-workspace-caption-background'
        });

        if (this._mySettings.get_enum('workspace-caption-position') == CaptionPosition.TOP)
            this._wsCaptionBackground.add_style_class_name('caption-top');

        this._taskBar = [];
        this._taskBarBox = null;
        this._menuTaskListBox = null;
        this._thumbnailShowId = 0;

        this._afterWindowAddedId = this._thumbnail.metaWorkspace.connect_after('window-added',
                                                          this._onAfterWindowAdded.bind(this));
        this._afterWindowRemovedId = this._thumbnail.metaWorkspace.connect_after('window-removed',
                                                            this._onAfterWindowRemoved.bind(this));

        this._switchWorkspaceNotifyId =
            global.window_manager.connect('switch-workspace',
                                          this.activeWorkspaceChanged.bind(this));

        this._menuManager = new PopupMenu.PopupMenuManager(this.actor);

        this._initCaption();
        this._thumbnailShowId = this._thumbnail.connect("show", this._initTaskbar.bind(this));
    }

    destroy() {
        this.workspaceRemoved();
        if (this._taskBarBox) {
            this._taskBarBox.destroy_all_children();
            this._taskBarBox = null;
        }
        if (this._menu) {
            this._menu.close();
            this._menu.destroy();
        }
    }

    workspaceRemoved() {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: workspaceRemoved");
        if (this._afterWindowAddedId > 0) {
            this._thumbnail.metaWorkspace.disconnect(this._afterWindowAddedId);
            this._afterWindowAddedId = 0;
        }

        if (this._afterWindowRemovedId > 0) {
            this._thumbnail.metaWorkspace.disconnect(this._afterWindowRemovedId);
            this._afterWindowRemovedId = 0;
        }

        if (this._switchWorkspaceNotifyId > 0) {
            global.window_manager.disconnect(this._switchWorkspaceNotifyId);
            this._switchWorkspaceNotifyId = 0;
        }

        for (let i = 0; i < this._taskBar.length; i++) {
            this._taskBar[i].metaWin.disconnect(this._taskBar[i].signalFocusedId);
        }
        this._taskBar = [];
    }

    // Tests if @actor belongs to this workspace and monitor
    _isMyWindow(actor, isMetaWin) {
        let win;
        if (isMetaWin) {
            win = actor;
        } else {
            win = actor.meta_window;
        }
        return win.located_on_workspace(this._thumbnail.metaWorkspace) &&
            (win.get_monitor() == this._thumbnail.monitorIndex);
    }

    // Tests if @win should be shown in the Overview
    _isOverviewWindow(window, isMetaWin) {
        let win;
        if (isMetaWin) {
            win = window;
        } else {
            win = window.get_meta_window();
        }
        return !win.skip_taskbar &&
               win.showing_on_its_workspace();
    }

    // Tests if window app should be shown on this workspace
    _isMinimizedWindow(actor, isMetaWin) {
        let win;
        if (isMetaWin) {
            win = actor;
        } else {
            win = actor.meta_window;
        }
        return (!win.skip_taskbar && win.minimized);
    }

    // Tests if window app should be shown on this workspace
    _showWindowAppOnThisWorkspace(actor, isMetaWin) {
        let win;
        if (isMetaWin) {
            win = actor;
        } else {
            win = actor.meta_window;
        }
        let workspaceManager = global.workspace_manager;
        let activeWorkspace = workspaceManager.get_active_workspace();
        if (this._settings.get_boolean('workspaces-only-on-primary')) {
            return (this._thumbnail.metaWorkspace == activeWorkspace && !win.skip_taskbar && win.is_on_all_workspaces());
        } else {
            return (win.located_on_workspace(this._thumbnail.metaWorkspace) && !win.skip_taskbar && win.showing_on_its_workspace());
        }
    }

    _initCaption() {
        if (_DEBUG_ && !this._thumbnail._removed) global.log("myWorkspaceThumbnail: _initCaption for metaWorkspace "+this._thumbnail.metaWorkspace.index());
        if (this._mySettings.get_boolean('workspace-captions')) {

            this._wsCaption = new St.BoxLayout({
                name: 'workspacestodockCaption',
                reactive: false,
                style_class: 'workspacestodock-workspace-caption',
                pack_start: true
            });

            let currentItems = this._mySettings.get_strv('workspace-caption-items');

            for (let i = 0; i < currentItems.length; i++) {
                let elements = currentItems[i].split(':');
                let item = elements[0]
                let expandState = (elements[1] == "true"? true: false);

                switch (item) {
                    case "number":
                        this._wsNumber = new St.Label({
                            name: 'workspacestodockCaptionNumber',
                            text: '',
                            x_align: Clutter.ActorAlign.CENTER,
                            y_align: Clutter.ActorAlign.CENTER
                        });
                        this._wsNumberBox = new St.BoxLayout({
                            name: 'workspacestodockCaptionNumberBox',
                            style_class: 'workspacestodock-caption-number',
                            x_align: Clutter.ActorAlign.START,
                            y_align: this._captionYAlign,
                            x_expand: expandState,
                            y_expand: expandState
                        });
                        this._wsNumberBox.add_actor(this._wsNumber);
                        this._wsCaption.add_actor(this._wsNumberBox);
                        break;
                    case "name":
                        this._wsName = new St.Label({
                            name: 'workspacestodockCaptionName',
                            text: '',
                            x_align: Clutter.ActorAlign.CENTER,
                            y_align: Clutter.ActorAlign.CENTER
                        });
                        this._wsNameBox = new St.BoxLayout({
                            name: 'workspacestodockCaptionNameBox',
                            style_class: 'workspacestodock-caption-name',
                            x_align: Clutter.ActorAlign.START,
                            y_align: this._captionYAlign,
                            x_expand: expandState
                        });
                        this._wsNameBox.add_actor(this._wsName);
                        this._wsCaption.add_actor(this._wsNameBox);
                        break;
                    case "windowcount":
                        this._wsWindowCount = new St.Label({
                            name: 'workspacestodockCaptionWindowCount',
                            text: '',
                            x_align: Clutter.ActorAlign.START,
                            y_align: Clutter.ActorAlign.CENTER
                        });
                        this._wsWindowCountBox = new St.BoxLayout({
                            name: 'workspacestodockCaptionWindowCountBox',
                            style_class: 'workspacestodock-caption-windowcount',
                            x_align: Clutter.ActorAlign.START,
                            y_align: this._captionYAlign,
                            x_expand: expandState
                        });
                        if (this._mySettings.get_boolean('workspace-caption-windowcount-image')) {
                            this._wsWindowCountBox.remove_style_class_name("workspacestodock-caption-windowcount");
                            this._wsWindowCountBox.add_style_class_name("workspacestodock-caption-windowcount-image");
                        }
                        this._wsWindowCountBox.add_actor(this._wsWindowCount);
                        this._wsCaption.add_actor(this._wsWindowCountBox);
                        break;
                    case "windowapps":
                        this._taskBarBox = new St.BoxLayout({
                            name: 'workspacestodockCaptionWindowApps',
                            reactive: false,
                            style_class: 'workspacestodock-caption-windowapps',
                            x_align: Clutter.ActorAlign.START,
                            y_align: this._captionYAlign,
                            x_expand: expandState,
                            y_expand: expandState
                        });
                        this._wsCaption.add_actor(this._taskBarBox);
                        break;
                    case "spacer":
                        this._wsSpacer = new St.Label({
                            name: 'workspacestodockCaptionSpacer',
                            text: '',
                            x_align: Clutter.ActorAlign.CENTER,
                            y_align: Clutter.ActorAlign.CENTER,
                            x_expand: expandState,
                            y_expand: expandState
                        });
                        this._wsSpacerBox = new St.BoxLayout({
                            name: 'workspacestodockCaptionSpacerBox',
                            style_class: 'workspacestodock-caption-spacer',
                            x_align: Clutter.ActorAlign.START,
                            y_align: this._captionYAlign,
                            x_expand: expandState,
                            y_expand: expandState
                        });
                        this._wsSpacerBox.add_actor(this._wsSpacer);
                        this._wsCaption.add_actor(this._wsSpacerBox);
                        break;
                }

            }

            // Add caption to thumbnail actor
            this.actor.add_actor(this._wsCaption);
            this._thumbnail.add_actor(this._wsCaptionBackground);
            this._thumbnail.add_actor(this.actor);

            // Make thumbnail background transparent so that it doesn't show through
            // on edges where border-radius is set on caption
            this._thumbnail.set_style("background-color: rgba(0,0,0,0.0)");

            // Create menu and menuitems
            let side = this._position;
            this._menu = new PopupMenu.PopupMenu(this._wsCaption, 0.5, side);

            // Set popup menu boxpointer point to center vertically on caption background
            // Otherwise the point lands at the top of the caption background because
            // the caption actually extends up another 18px.
            if (!this._isHorizontal)
                this._menu.setSourceAlignment(.8);

            this._menu.actor.add_style_class_name('workspacestodock-caption-windowapps-menu');
            this._menu.connect('open-state-changed', (menu, open) => {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWindowAppsButtonClick - menu open-state-changed - open = "+open);
                if (open) {
                    // Set popup menu flag so that dock knows not to hide
                    this._thumbnail._thumbnailsBox.setPopupMenuFlag(true);

                    // Set windowAppsBox icons back to normal (not zoomed)
                    if (this._taskBarBox) {
                        let children = this._taskBarBox.get_children();
                        for (let i=0; i < children.length; i++) {
                            children[i]._delegate._icon.setIconSize(this._mySettings.get_double('workspace-caption-taskbar-icon-size'));
                        }
                    }
                } else {
                    // Unset popup menu flag
                    this._thumbnail._thumbnailsBox.setPopupMenuFlag(false);
                }
            });

            let item = new PopupMenu.PopupMenuItem(_("Extension Preferences"));
            item.connect('activate', this._showExtensionPreferences.bind(this));
            this._menu.addMenuItem(item);

            // Add to chrome and hide
            //Main.layoutManager.addChrome(this._menu.actor);
            Main.uiGroup.add_actor(this._menu.actor);
            this._menu.actor.hide();

            // Add menu to menu manager
            this._menuManager.addMenu(this._menu);
        }

    }

    // function initializes the taskbar icons
    _initTaskbar() {
        if (_DEBUG_ && !this._thumbnail._removed) global.log("myWorkspaceThumbnail: _initTaskbar for metaWorkspace "+this._thumbnail.metaWorkspace.index());
        if(this._thumbnailShowId > 0){
            this._thumbnail.disconnect(this._thumbnailShowId);
            this._thumbnailShowId = 0;
        } else {
            return;
        }

        // Create initial task icons for app windows on workspace
        let windows = global.get_window_actors();
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _initTaskbar - window count = "+windows.length);
        for (let i = 0; i < windows.length; i++) {
            let metaWin = windows[i].get_meta_window();
            if (!metaWin)
                continue;

            if (_DEBUG_) global.log("myWorkspaceThumbnail: _initTaskbar - add window buttons");
            let tracker = Shell.WindowTracker.get_default();
            let app = tracker.get_window_app(metaWin);
            if (app) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _initTaskbar - window button app = "+app.get_name());
                if(this._taskBarBox){
                    let button = new TaskbarIcon(app, metaWin, this);
                    if (metaWin.has_focus()) {
                        button.actor.add_style_class_name('workspacestodock-caption-windowapps-button-active');
                    }

                    if ((this._isMyWindow(windows[i]) && this._isOverviewWindow(windows[i])) ||
                        (this._isMyWindow(windows[i]) && this._isMinimizedWindow(windows[i])) ||
                        this._showWindowAppOnThisWorkspace(windows[i])) {
                        button.actor.visible = true;
                    } else {
                        button.actor.visible = false;
                    }

                    this._taskBarBox.add_actor(button.actor);
                }
                let winInfo = {};
                winInfo.app = app;
                winInfo.metaWin = metaWin;
                winInfo.signalFocusedId = metaWin.connect('notify::appears-focused', this._onWindowChanged.bind(this, metaWin));
                this._taskBar.push(winInfo);
            }
        }

        // Update window count
        this._updateWindowCount();
    }

    // function called when the active workspace is changed
    // windows visible on all workspaces are moved to active workspace
    activeWorkspaceChanged() {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: activeWorkspaceChanged");
        let windows = global.get_window_actors();
        let workspaceManager = global.workspace_manager;
        let activeWorkspace = workspaceManager.get_active_workspace();
        if (_DEBUG_) global.log("myWorkspaceThumbnail: activeWorkspaceChanged - window count = "+windows.length);
        for (let i = 0; i < windows.length; i++) {
            let metaWin = windows[i].get_meta_window();
            if (!metaWin)
                continue;

            if ((this._isMyWindow(windows[i]) && this._isOverviewWindow(windows[i])) ||
                (this._isMyWindow(windows[i]) && this._isMinimizedWindow(windows[i])) ||
                this._showWindowAppOnThisWorkspace(windows[i])) {

                // Show taskbar icon if already present
                let index = -1;
                for (let i = 0; i < this._taskBar.length; i++) {
                    if (this._taskBar[i].metaWin == metaWin) {
                        index = i;
                        if (this._taskBarBox) {
                            let buttonActor = this._taskBarBox.get_child_at_index(index);
                            buttonActor.visible = true;
                        }
                        break;
                    }
                }
                if (index > -1)
                    continue;

            } else {
                // Hide taskbar icon
                let index = -1;
                for (let i = 0; i < this._taskBar.length; i++) {
                    if (this._taskBar[i].metaWin == metaWin) {
                        index = i;
                        if (this._taskBarBox) {
                            let buttonActor = this._taskBarBox.get_child_at_index(index);
                            buttonActor.visible = false;
                        }
                        break;
                    }
                }
            }
        }

        // Update window count
        this._updateWindowCount();
    }

    _onAfterWindowAdded(metaWorkspace, metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onAfterWindowAdded");
        this._doAfterWindowAdded(metaWin);
    }

    _doAfterWindowAdded(metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _doAfterWindowAdded");
        let win = metaWin.get_compositor_private();
        if (!win) {
            // Newly-created windows are added to a workspace before
            // the compositor finds out about them...
            let id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                                                if (this.actor &&
                                                    metaWin.get_compositor_private())
                                                    this._doAfterWindowAdded(metaWin);
                                                return GLib.SOURCE_REMOVE;
                                            });
            GLib.Source.set_name_by_id(id, '[gnome-shell] this._doAfterWindowAdded');
            return;
        }

        this._thumbnail._thumbnailsBox.updateTaskbars(metaWin, WindowAppsUpdateAction.ADD);
    }

    _onAfterWindowRemoved(metaWorkspace, metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onAfterWindowRemoved - metaWin = "+metaWin.get_wm_class()+" metaWorkspace = "+metaWorkspace.index());
        this._thumbnail._thumbnailsBox.updateTaskbars(metaWin, WindowAppsUpdateAction.REMOVE);
    }

    _onWindowChanged(metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWindowChanged - metaWin = "+metaWin.get_wm_class());
        if (!this._taskBarBox)
            return;

        let index = -1;
        for (let i = 0; i < this._taskBar.length; i++) {
            if (this._taskBar[i].metaWin == metaWin) {
                index = i;
                break;
            }
        }
        if (index > -1) {
            let buttonActor = this._taskBarBox.get_child_at_index(index);
            if (metaWin.appears_focused) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWindowChanged - button app is focused");
                buttonActor.add_style_class_name('workspacestodock-caption-windowapps-button-active');
            } else {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _onWindowChanged - button app is not focused");
                buttonActor.remove_style_class_name('workspacestodock-caption-windowapps-button-active');
            }
        }
    }

    // NOTE: The caption popup menu is now called from the thumbnailsbox button release event.
    // This allows us to keep the caption boxlayout non-reactive so that thumbnail window clones
    // are draggable.
    showCaptionMenu() {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: showCaptionMenu");
        if (this._menu.isOpen) {
            this._menu.close();
            return Clutter.EVENT_STOP;
        }

        this._menu.removeAll();

        this._menuTaskListBox = new St.BoxLayout({vertical: true});
        let menuTaskListItemCount = 0;
        if (this._taskBarBox) {
            for (let i=0; i < this._taskBar.length; i++) {
                let buttonActor = this._taskBarBox.get_child_at_index(i);
                let metaWin = this._taskBar[i].metaWin;
                let app = this._taskBar[i].app;
                let item = new MenuTaskListItem(app, metaWin, this);
                if (buttonActor.visible) {
                    menuTaskListItemCount ++;
                } else {
                    item.actor.visible = false;
                }
                this._menuTaskListBox.add_actor(item.actor);
            }
        }

        let windowAppsListsection = new PopupMenu.PopupMenuSection();
        windowAppsListsection.actor.add_actor(this._menuTaskListBox);

        let appsArray = this._menuTaskListBox.get_children();
        if (menuTaskListItemCount > 0) {
            this._menu.addMenuItem(windowAppsListsection);
            if (menuTaskListItemCount > 1) {
                let item1 = new PopupMenu.PopupMenuItem(_('Close All Applications'));
                item1.connect('activate', this._closeAllMetaWindows.bind(this));
                this._menu.addMenuItem(item1);
            }
            this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }

        let item2 = new PopupMenu.PopupMenuItem(_("Extension Preferences"));
        item2.connect('activate', this._showExtensionPreferences.bind(this));
        this._menu.addMenuItem(item2);

        this._menu.open();
        return Clutter.EVENT_STOP;
    }

    activateMetaWindow(metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: activateMetaWindow");
        let workspaceManager = global.workspace_manager;
        let activeWorkspace = workspaceManager.get_active_workspace();
        if (_DEBUG_) global.log("_myWorkspaceThumbnail: activateMetaWindow - activeWorkspace = "+activeWorkspace);
        if (_DEBUG_) global.log("_myWorkspaceThumbnail: activateMetaWindow - metaWorkspace = "+this._thumbnail.metaWorkspace);
        if (activeWorkspace != this._thumbnail.metaWorkspace) {
            if (_DEBUG_) global.log("_myWorkspaceThumbnail: activateMetaWindow - activeWorkspace is not metaWorkspace");
            this._thumbnail.activate(global.get_current_time());
            metaWin.activate(global.get_current_time());
        } else {
            if (!metaWin.has_focus()) {
                metaWin.activate(global.get_current_time());
            } else {
                metaWin.minimize();
            }
        }
    }

    _showExtensionPreferences(menuItem, event) {
        if (typeof ExtensionUtils.openPrefs === 'function') {
            ExtensionUtils.openPrefs();
        } else {
            Util.spawn(["gnome-shell-extension-prefs", Me.metadata.uuid]);
        }
    }

    closeMetaWindow(metaWin) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: closeMetaWindow");
        let metaWindow = metaWin;
        for (let i = 0; i < this._taskBar.length; i++) {
            if (this._taskBar[i].metaWin == metaWindow) {
                // Delete metaWindow
                metaWindow.delete(global.get_current_time());
            }
        }
    }

    _closeAllMetaWindows(menuItem, event) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _closeAllMetaWindows");
        if (this._taskBarBox) {
            for (let i = 0; i < this._taskBar.length; i++) {
                let buttonActor = this._taskBarBox.get_child_at_index(i);
                if (buttonActor.visible) {
                    // Delete metaWindow
                    this._taskBar[i].metaWin.delete(global.get_current_time());
                }

                // NOTE: bug quiting all GIMP windows
                // even tried this _taskBar[i].app.request_quit();
                // Gnome Shell has same issue .. selecting quit from panel app menu only closes current Gimp window
                // Unity has same issue .. https://bugs.launchpad.net/ubuntu/+source/unity/+bug/1123593
            }
        }
    }

    updateTaskbar(metaWin, action) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: updateTaskbar");
        if (action == WindowAppsUpdateAction.ADD) {
            let index = -1;
            for (let i = 0; i < this._taskBar.length; i++) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: updateTaskbar - window button at index "+i+" is "+this._taskBar[i]);
                if (this._taskBar[i].metaWin == metaWin) {
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: updateTaskbar - window button found at index = "+i);
                    index = i;
                    if (this._taskBarBox) {
                        let buttonActor = this._taskBarBox.get_child_at_index(index);
                        if ((this._isMyWindow(metaWin, true) && this._isOverviewWindow(metaWin, true)) ||
                            (this._isMyWindow(metaWin, true) && this._isMinimizedWindow(metaWin, true)) ||
                            this._showWindowAppOnThisWorkspace(metaWin, true)) {
                            buttonActor.visible = true;
                        } else {
                            buttonActor.visible = false;
                        }
                    }
                    break;
                }
            }
            if (index < 0) {
                let tracker = Shell.WindowTracker.get_default();
                if (!metaWin.skip_taskbar) {

                    if (_DEBUG_) global.log("myWorkspaceThumbnail: updateTaskbar - window button not found .. add it");
                    let app = tracker.get_window_app(metaWin);
                    if (app) {
                        if (_DEBUG_) global.log("myWorkspaceThumbnail: updateTaskbar - window button app = "+app.get_name());
                        if (this._taskBarBox) {
                            let button = new TaskbarIcon(app, metaWin, this);
                            if (metaWin.has_focus()) {
                                button.actor.add_style_class_name('workspacestodock-caption-windowapps-button-active');
                            }

                            if ((this._isMyWindow(metaWin, true) && this._isOverviewWindow(metaWin, true)) ||
                                (this._isMyWindow(metaWin, true) && this._isMinimizedWindow(metaWin, true)) ||
                                this._showWindowAppOnThisWorkspace(metaWin, true)) {
                                button.actor.visible = true;
                            } else {
                                button.actor.visible = false;
                            }
                            this._taskBarBox.add_actor(button.actor);
                        }

                        let winInfo = {};
                        winInfo.app = app;
                        winInfo.metaWin = metaWin;
                        winInfo.signalFocusedId = metaWin.connect('notify::appears-focused', this._onWindowChanged.bind(this, metaWin));
                        this._taskBar.push(winInfo);
                    }
                }
            }
        } else if (action == WindowAppsUpdateAction.REMOVE) {
            if (_DEBUG_) global.log("myWorkspaceThumbnail: updateTaskbar - wsWindowApps exists");
            if (_DEBUG_) global.log("myWorkspaceThumbnail: updateTaskbar - metaWin closed = "+metaWin.get_wm_class());
            let index = -1;
            if (_DEBUG_) global.log("myWorkspaceThumbnail: updateTaskbar - window buttons count = "+this._taskBar.length);
            for (let i = 0; i < this._taskBar.length; i++) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: updateTaskbar - window button at index "+i+" is "+this._taskBar[i].metaWin.get_wm_class());
                if (this._taskBar[i].metaWin == metaWin) {
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: updateTaskbar - window button found at index = "+i);
                    index = i;
                    break;
                }
            }
            if (index > -1) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: updateTaskbar - Splicing wsWindowAppsButtons at "+index);
                // Disconnect window focused signal
                metaWin.disconnect(this._taskBar[index].signalFocusedId);

                // Remove button from windowApps list and windowAppsBox container
                this._taskBar.splice(index, 1);
                if (this._taskBarBox) {
                    let buttonActor = this._taskBarBox.get_child_at_index(index);
                    if (_DEBUG_) global.log("myWorkspaceThumbnail: updateTaskbar - Removing button at index "+index);
                    this._taskBarBox.remove_actor(buttonActor);
                    buttonActor.destroy();
                }

                // Remove menuItem
                if (this._menuTaskListBox) {
                    let menuItemActor = this._menuTaskListBox.get_child_at_index(index);
                    if (menuItemActor) {
                        this._menuTaskListBox.remove_actor(menuItemActor);
                        menuItemActor.destroy();
                    }
                }
            }
        }

        // Update window count
        this._updateWindowCount();
    }

    _updateWindowCount() {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _updateWindowCount");
        if (!this._wsWindowCountBox)
            return;

        let className = "";
        let winCount = 0;
        let winMax = 4;

        for (let i = 0; i < this._taskBar.length; i++) {
            let metaWin = this._taskBar[i].metaWin;
            if ((this._isMyWindow(metaWin, true) && this._isOverviewWindow(metaWin, true)) ||
                (this._isMyWindow(metaWin, true) && this._isMinimizedWindow(metaWin, true)) ||
                this._showWindowAppOnThisWorkspace(metaWin, true)) {
                winCount ++;
            }
        }

        if (!this._mySettings.get_boolean('workspace-caption-windowcount-image')) {
            // clear box images
            for(let i = 1; i <= winMax; i++){
                let className = 'workspacestodock-caption-windowcount-image-'+i;
                this._wsWindowCountBox.remove_style_class_name(className);
            }

            // Set label text
            if (winCount > 0) {
                this._wsWindowCount.set_text(""+winCount);
            } else {
                this._wsWindowCount.set_text("");
            }

        } else {
            // clear label text
            this._wsWindowCount.set_text("");

            // Set background image class
            if (winCount > winMax)
                winCount = winMax;

            for(let i = 1; i <= winMax; i++){
                let className = 'workspacestodock-caption-windowcount-image-'+i;
                if (i != winCount) {
                    this._wsWindowCountBox.remove_style_class_name(className);
                } else {
                    this._wsWindowCountBox.add_style_class_name(className);
                }
            }
        }
    }

    updateCaption(i, captionHeight, captionBackgroundHeight) {
        let unscale = 1/this._thumbnail._thumbnailsBox._scale;
        let containerWidth = this._thumbnail._thumbnailsBox._porthole.width * this._thumbnail._thumbnailsBox._scale;
        let containerHeight = this._thumbnail._thumbnailsBox._porthole.height * this._thumbnail._thumbnailsBox._scale;

        if (!this._wsCaptionBackground)
            return;

        this._wsCaptionBackground.set_scale(unscale, unscale);

        // ISSUE: Gnome uses monitor screen to create background actor
        // passingthru67: Reposition background to match workspace desktop porthole
        let px = this._thumbnail._thumbnailsBox._porthole.x - Main.layoutManager.monitors[this._thumbnail.monitorIndex].x;
        let py = this._thumbnail._thumbnailsBox._porthole.y - Main.layoutManager.monitors[this._thumbnail.monitorIndex].y;
        if (this._mySettings.get_enum('workspace-caption-position') == CaptionPosition.TOP) {
            this._wsCaptionBackground.set_position(0, 0);
            this._thumbnail._contents.set_position(-this._thumbnail._thumbnailsBox._porthole.x, -this._thumbnail._thumbnailsBox._porthole.y + (captionBackgroundHeight * unscale));
        } else {
            this._wsCaptionBackground.set_position(0, this._thumbnail._thumbnailsBox._porthole.height);
            this._thumbnail._contents.set_position(-this._thumbnail._thumbnailsBox._porthole.x, -this._thumbnail._thumbnailsBox._porthole.y);
        }
        this._thumbnail._bgManager.backgroundActor.set_clip(px, py, this._thumbnail._thumbnailsBox._porthole.width, this._thumbnail._thumbnailsBox._porthole.height);
        this._wsCaptionBackground.set_size(containerWidth, captionBackgroundHeight);

        if (!this.actor)
            return;

        this.actor.set_scale(unscale, unscale);
        this.actor.set_size(containerWidth, containerHeight + captionBackgroundHeight);


        if (!this._wsCaption)
            return;

        this._wsCaption.height = captionHeight; // constrains height to caption height

        if (this._wsNumber)
            this._wsNumber.set_text(""+(i+1));

        if (this._wsNumberBox)
            this._wsNumberBox.height = captionBackgroundHeight - 2;

        if (this._wsName)
            this._wsName.set_text(Meta.prefs_get_workspace_name(i));

        if (this._wsNameBox)
            this._wsNameBox.height = captionBackgroundHeight - 2;

        if (this._wsWindowCountBox)
            this._wsWindowCountBox.height = captionBackgroundHeight - 2;

        if (this._taskBarBox)
            this._taskBarBox.height = captionHeight;


        let workspaceManager = global.workspace_manager;
        if (i == workspaceManager.get_active_workspace_index()) {
            if (this._wsCaptionBackground) {
                this._wsCaptionBackground.add_style_class_name('workspacestodock-workspace-caption-background-current');
                if (this._mySettings.get_enum('workspace-caption-position') == CaptionPosition.TOP)
                    this._wsCaptionBackground.add_style_class_name('caption-top');
            }
            if (this._wsCaption) this._wsCaption.add_style_class_name('workspacestodock-workspace-caption-current');
            if (this._wsNumberBox) this._wsNumberBox.add_style_class_name('workspacestodock-caption-number-current');
            if (this._wsNameBox) this._wsNameBox.add_style_class_name('workspacestodock-caption-name-current');
            if (this._wsWindowCountBox) {
                if (this._mySettings.get_boolean('workspace-caption-windowcount-image')) {
                    this._wsWindowCountBox.add_style_class_name('workspacestodock-caption-windowcount-image-current');
                } else {
                    this._wsWindowCountBox.add_style_class_name('workspacestodock-caption-windowcount-current');
                }
            }
            if (this._wsSpacerBox) this._wsSpacerBox.add_style_class_name('workspacestodock-caption-spacer-current');
        } else {
            if (this._wsCaptionBackground) this._wsCaptionBackground.remove_style_class_name('workspacestodock-workspace-caption-background-current');
            if (this._wsCaption) this._wsCaption.remove_style_class_name('workspacestodock-workspace-caption-current');
            if (this._wsNumberBox) this._wsNumberBox.remove_style_class_name('workspacestodock-caption-number-current');
            if (this._wsNameBox) this._wsNameBox.remove_style_class_name('workspacestodock-caption-name-current');
            if (this._wsWindowCountBox) {
                if (this._mySettings.get_boolean('workspace-caption-windowcount-image')) {
                    this._wsWindowCountBox.remove_style_class_name('workspacestodock-caption-windowcount-image-current');
                } else {
                    this._wsWindowCountBox.remove_style_class_name('workspacestodock-caption-windowcount-current');
                }
            }
            if (this._wsSpacerBox) this._wsSpacerBox.remove_style_class_name('workspacestodock-caption-spacer-current');
        }
    }
};
