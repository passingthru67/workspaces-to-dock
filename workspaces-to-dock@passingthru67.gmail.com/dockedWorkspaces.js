/* ========================================================================================================
 * dockedWorkspaces.js - dock object that holds the workspaces thumbnailsBox
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  This code was copied from the dash-to-dock extension https://github.com/micheleg/dash-to-dock
 *  and modified to create a workspaces dock. Many thanks to michele_g for a great extension.
 *
 *  Part of this code also comes from gnome-shell-extensions:
 *  http://git.gnome.org/browse/gnome-shell-extensions/
 * ========================================================================================================
 */

const _DEBUG_ = false;

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const IconTheme = imports.gi.Gtk.IconTheme;
const Params = imports.misc.params;

const Main = imports.ui.main;
const WorkspacesView = imports.ui.workspacesView;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;
const Tweener = imports.ui.tweener;
const WorkspaceSwitcherPopup = imports.ui.workspaceSwitcherPopup;
const Overview = imports.ui.overview;
const OverviewControls = imports.ui.overviewControls;
const Layout = imports.ui.layout;
const MessageTray = imports.ui.messageTray;

const ExtensionSystem = imports.ui.extensionSystem;
const ExtensionUtils = imports.misc.extensionUtils;
const Config = imports.misc.config;
const Me = ExtensionUtils.getCurrentExtension();
const Extension = Me.imports.extension;
const Convenience = Me.imports.convenience;
const MyWorkspaceThumbnail = Me.imports.myWorkspaceThumbnail;
const ShortcutsPanel = Me.imports.shortcutsPanel;
const MyWorkspaceSwitcherPopup = Me.imports.myWorkspaceSwitcherPopup;
const MyPressureBarrier = Me.imports.myPressureBarrier;

const DashToDock_UUID = "dash-to-dock@micxgx.gmail.com";
let DashToDockExtension = null;
let DashToDock = null;

const DOCK_EDGE_VISIBLE_WIDTH = 5;
const DOCK_EDGE_VISIBLE_OVERVIEW_WIDTH = 32;
const PRESSURE_TIMEOUT = 1000;

let GSFunctions = {};

const IntellihideAction = {
    SHOW_FULL: 0,
    SHOW_PARTIAL: 1,
    SHOW_PARTIAL_FIXED: 2
};

const OverviewAction = {
    SHOW_FULL: 0,        // Dock is always visible
    HIDE: 1,        // Dock is always invisible. Visible on mouse hover
    SHOW_PARTIAL: 2      // Dock partially hidden. Visible on mouse hover
};

const DockState = {
    HIDDEN:  0,
    SHOWING: 1,
    SHOWN:   2,
    HIDING:  3
};

// Return the actual position reverseing left and right in rtl
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

function getDockStateDesc(state) {
    let desc = "";
    switch (state) {
    case DockState.HIDDEN:
        desc = "HIDDEN";
        break;
    case DockState.SHOWING:
        desc = "SHOWING";
        break;
    case DockState.SHOWN:
        desc = "SHOWN";
        break;
    case DockState.HIDING:
        desc = "HIDING";
        break;
    }
    return desc;
}

var ThumbnailsSlider = new Lang.Class({
    Name: 'workspacestodockThumbnailsSlider',

    _init: function(params) {
        this._settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        let initialTriggerWidth = 1;

        // Default local params
        let localDefaults = {
            side: St.Side.LEFT,
            initialSlideValue: 1,
            initialSlideoutSize: initialTriggerWidth
        }

        let localParams = Params.parse(params, localDefaults, true);

        if (params){
            // Remove local params before passing the params to the parent
            // constructor to avoid errors.
            let prop;
            for (prop in localDefaults) {
                if ((prop in params))
                    delete params[prop];
            }
        }

        this.actor = new Shell.GenericContainer(params);
        this.actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
        this.actor.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
        this.actor.connect('allocate', Lang.bind(this, this._allocate));

        this.actor._delegate = this;

        this._child = null;

        // slide parameter: 1 = visible, 0 = hidden.
        this._slidex = localParams.initialSlideValue;
        this._side = localParams.side;
        this._slideoutSize = localParams.initialSlideoutSize; // minimum size when slid out
        this._partialSlideoutSize = initialTriggerWidth + DOCK_EDGE_VISIBLE_OVERVIEW_WIDTH;
    },

    destroy: function() {

    },

    _allocate: function(actor, box, flags) {
        if (this._child == null)
            return;

        let availWidth = box.x2 - box.x1;
        let availHeight = box.y2 - box.y1;
        let [minChildWidth, minChildHeight, natChildWidth, natChildHeight] =
            this._child.get_preferred_size();

        let childWidth = natChildWidth;
        let childHeight = natChildHeight;

        let childBox = new Clutter.ActorBox();

        let slideoutSize = this._slideoutSize;

        if (this._side == St.Side.LEFT) {
            childBox.x1 = (this._slidex -1) * (childWidth - slideoutSize);
            childBox.x2 = slideoutSize + this._slidex * (childWidth - slideoutSize);
            childBox.y1 = 0;
            childBox.y2 = childBox.y1 + childHeight;
        } else if (this._side ==  St.Side.RIGHT
                 || this._side ==  St.Side.BOTTOM) {
            childBox.x1 = 0;
            childBox.x2 = childWidth;
            childBox.y1 = 0;
            childBox.y2 = childBox.y1 + childHeight;
        } else if (this._side ==  St.Side.TOP) {
            childBox.x1 = 0;
            childBox.x2 = childWidth;
            childBox.y1 = (this._slidex -1) * (childHeight - slideoutSize);
            childBox.y2 = slideoutSize + this._slidex * (childHeight - slideoutSize);
        }

        this._child.allocate(childBox, flags);
        this._child.set_clip(-childBox.x1, -childBox.y1,
                             -childBox.x1+availWidth,-childBox.y1 + availHeight);
    },

    // Just the child width but taking into account the slided out part
    _getPreferredWidth: function(actor, forHeight, alloc) {
        let slideoutSize = this._slideoutSize;
        let [minWidth, natWidth ] = this._child.get_preferred_width(forHeight);
        if (this._side ==  St.Side.LEFT
          || this._side == St.Side.RIGHT) {
            minWidth = (minWidth - slideoutSize)*this._slidex + slideoutSize;
            natWidth = (natWidth - slideoutSize)*this._slidex + slideoutSize;
        }

        alloc.min_size = minWidth;
        alloc.natural_size = natWidth;
    },

    // Just the child height but taking into account the slided out part
    _getPreferredHeight: function(actor, forWidth, alloc) {
        let slideoutSize = this._slideoutSize;
        let [minHeight, natHeight] = this._child.get_preferred_height(forWidth);
        if (this._side ==  St.Side.TOP
          || this._side ==  St.Side.BOTTOM) {
            minHeight = (minHeight - slideoutSize)*this._slidex + slideoutSize;
            natHeight = (natHeight - slideoutSize)*this._slidex + slideoutSize;
        }

        alloc.min_size = minHeight;
        alloc.natural_size = natHeight;
    },

    // I was expecting it to be a virtual function... stil I don't understand
    // how things work.
    add_child: function(actor) {

        // I'm supposed to have only one child
        if(this._child !== null) {
            this.actor.remove_child(actor);
        }

        this._child = actor;
        this.actor.add_child(actor);
    },

    set slidex(value) {
        this._slidex = value;
        this._child.queue_relayout();
    },

    get slidex() {
        return this._slidex;
    },

    set slideoutSize(value) {
        this._slideoutSize = value;
    },

    get slideoutSize() {
        return this._slideoutSize;
    },

    set partialSlideoutSize(value) {
        this._partialSlideoutSize = value;
    },

    get partialSlideoutSize() {
        return this._partialSlideoutSize;
    }
});

var DockedWorkspaces = new Lang.Class({
    Name: 'workspacestodockDockedWorkspaces',

    _init: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: init * * * * *");
        this._gsCurrentVersion = Config.PACKAGE_VERSION.split('.');
        this._settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        this._signalHandler = new Convenience.globalSignalHandler();

        // Temporarily disable redisplay until initialized
        // NOTE: This prevents connected signals from trying to update dock visibility
        this._disableRedisplay = true;
        this._refreshThumbnailsOnRegionUpdate = true;
        if (_DEBUG_) global.log("dockedWorkspaces: init - disableRediplay");

        // set RTL value
        this._rtl = Clutter.get_default_text_direction() == Clutter.TextDirection.RTL;
        if (_DEBUG_) global.log("dockedWorkspaces: init - rtl = "+this._rtl);

        // Load settings
        this._bindSettingsChanges();

        // Set position of dock
        this._position = getPosition(this._settings);
        this._isHorizontal = (this._position == St.Side.TOP ||
                              this._position == St.Side.BOTTOM);

        // Authohide current status. Not to be confused with autohide enable/disagle global (g)settings
        // Initially set to null - will be set during first enable/disable autohide
        this._autohideStatus = null;

        // Initialize dock state
        this._dockState = DockState.HIDDEN;

        // Initialize popup menu flag
        this._popupMenuShowing = false;

        // Initialize colors with generic values
        this._defaultBackground = {red:0, green:0, blue:0, alpha:0};
        this._customBackground = {red:0, green:0, blue:0, alpha:0};
        this._defaultBorder = {red:0, green:0, blue:0, alpha:0};
        this._customBorder = {red:0, green:0, blue:0, alpha:0};
        this._cssStylesheet = null;

        // Initialize pressure barrier variables
        this._canUsePressure = false;
        this._pressureSensed = false;
        this._pressureBarrier = null;
        this._barrier = null;
        this._removeBarrierTimeoutId = 0;

        // Override Gnome Shell functions
        this._overrideGnomeShellFunctions();

        // Set the _monitor property to the primary monitor
        this._monitor = Main.layoutManager.primaryMonitor;

        // Create a new thumbnailsbox object
        this._thumbnailsBox = new MyWorkspaceThumbnail.myThumbnailsBox(this);

        // Create a shortcuts panel object
        this._shortcutsPanel = new ShortcutsPanel.ShortcutsPanel(this);
        this._shortcutsPanel.connect("update-favorite-apps", Lang.bind(this, this._onShortcutsPanelUpdated));
        this._shortcutsPanel.connect("update-running-apps", Lang.bind(this, this._onShortcutsPanelUpdated));

        // Create custom workspace switcher popup
        this._workspaceSwitcher = null;
        if (this._isHorizontal && this._settings.get_boolean('horizontal-workspace-switching'))
            this._workspaceSwitcher = new MyWorkspaceSwitcherPopup.WorkspaceSwitcher();

        // Create position styles for dock container
        let positionStyleClass = ['top', 'right', 'bottom', 'left'];
        let styleClass = positionStyleClass[this._position];
        if (this._settings.get_boolean('dock-fixed')
            || (this._settings.get_boolean('intellihide') && this._settings.get_enum('intellihide-action') == IntellihideAction.SHOW_PARTIAL_FIXED)) {
                styleClass += " fixed";
        }

        let shortcutsPanelOrientation = this._settings.get_enum('shortcuts-panel-orientation');
        if (this._settings.get_boolean('show-shortcuts-panel')) {
            if (shortcutsPanelOrientation == 1) {
                styleClass += " inside";
            } else {
                styleClass += " outside";
            }
        }

        if (this._settings.get_boolean('customize-height') && this._settings.get_int('customize-height-option') == 1) {
            if (this._settings.get_double('top-margin') == 0 || this._settings.get_double('bottom-margin') == 0) {
                styleClass += " fullheight";
            }
        }

        // Set _extendContainer property
        if (this._settings.get_boolean('customize-height') && this._settings.get_int('customize-height-option') == 1) {
            this._extendContainer = true;
        } else {
            this._extendContainer = false;
        }

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

        // Initialize alignment and box packing variables
        let align;
        let packStart;
        let packVertical = this._isHorizontal? true : false;
        if (this._position == St.Side.TOP || this._position == St.Side.LEFT) {
            align = St.Align.START;
            packStart = true;
        } else {
            align = St.Align.END;
            packStart = false;
        }

        // Create the main dock and container
        this._dock = new St.BoxLayout({
            name: 'workspacestodockDock',
            reactive: true,
            track_hover: true,
            vertical: packVertical,
            pack_start: !packStart,
            style_class: styleClass
        });

        this._dockContainer = new St.BoxLayout({
            name: 'workspacestodockDockContainer',
            reactive: false,
            track_hover: false,
            vertical: !packVertical
        });

        // Create the panels and container
        this._panels = new St.BoxLayout({
            name: 'workspacestodockPanels',
            reactive: false,
            track_hover: false,
            vertical: packVertical,
            pack_start: !packStart
        });

        this._panelsContainer = new St.BoxLayout({
            name: 'workspacestodockPanelsContainer',
            reactive: false,
            track_hover: false,
            vertical: packVertical,
            pack_start: packStart
        });

        // To center the panels on the extended dock, we expand the panels box to fit the
        // dock container and align it in the middle
        let expandContainer = this._centerContainer ? true : false;
        this._panels.add_actor(this._panelsContainer);
        this._dockContainer.add(this._panels,{x_fill: false, y_fill: false, x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE, expand: expandContainer});

        // Initialize keyboard toggle timeout
        this._toggleWithKeyboardTimeoutId = 0;

        // Connect the _dock hover, scroll and button release events
        this._checkHoverStatusId = 0;
        this._scrollWorkspaceSwitchDeadTimeId = 0;
        this._dock.connect("notify::hover", Lang.bind(this, this._hoverChanged));
        this._dock.connect("scroll-event", Lang.bind(this, this._onScrollEvent));
        this._dock.connect("button-release-event", Lang.bind(this, this._onDockClicked));

        // Add workspaces, and shortcuts panel to dock container based on dock position
        // and shortcuts panel orientation
        if (shortcutsPanelOrientation == 1) {
            if (this._centerContainer && this._centerPanelsIndependently) {
                this._panelsContainer.add(this._shortcutsPanel.actor,{x_fill: false, y_fill: false, x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE});
                this._panelsContainer.add(this._thumbnailsBox.actor,{x_fill: false, y_fill: false, x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE});
            } else {
                this._panelsContainer.add_actor(this._shortcutsPanel.actor);
                this._panelsContainer.add_actor(this._thumbnailsBox.actor);
            }
        } else {
            if (this._centerContainer && this._centerPanelsIndependently) {
                this._panelsContainer.add(this._thumbnailsBox.actor,{x_fill: false, y_fill: false, x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE});
                this._panelsContainer.add(this._shortcutsPanel.actor,{x_fill: false, y_fill: false, x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE});
            } else {
                this._panelsContainer.add_actor(this._thumbnailsBox.actor);
                this._panelsContainer.add_actor(this._shortcutsPanel.actor);
            }
        }

        // Create the sliding actor whose allocation is to be tracked for input regions
        let slideoutSize = this._settings.get_boolean('dock-edge-visible') ? this._triggerWidth + DOCK_EDGE_VISIBLE_WIDTH : this._triggerWidth;
        this._slider = new ThumbnailsSlider({side: this._position, initialSlideoutSize: slideoutSize});

        // Create the dock main actor
        this.actor = new St.Bin({ name: 'workspacestodockMainActor',
            reactive: false,
            x_align: align,
            y_align: align
        });
        this.actor._delegate = this;
        this._realizeId = this.actor.connect("realize", Lang.bind(this, this._initialize));

        // Add the dock to slider and then to the main container actor
        this._dock.add_actor(this._dockContainer);
        this._slider.add_child(this._dock);
        this.actor.set_child(this._slider.actor);

        // Connect global signals
        let workspaceManager = global.workspace_manager;
        this._signalHandler.push(
            [
                this._thumbnailsBox.actor,
                'notify::width',
                Lang.bind(this, this._thumbnailsBoxResized)
            ],
            [
                this._thumbnailsBox.actor,
                'notify::height',
                Lang.bind(this, this._thumbnailsBoxResized)
            ],
            [
                Main.layoutManager,
                'monitors-changed',
                Lang.bind(this, this._onMonitorsChanged)
            ],
            [
                St.ThemeContext.get_for_stage(global.stage),
                'changed',
                Lang.bind(this, this._onThemeChanged)
            ],
            [
                IconTheme.get_default(),
                'changed',
                Lang.bind(this, this._onIconsChanged)
            ],
            [
                ExtensionSystem._signals,
                'extension-state-changed',
                Lang.bind(this, this._onExtensionSystemStateChanged)
            ],
            [
                Main.overview.viewSelector,
                'notify::y',
                Lang.bind(this, this._updateYPosition)
            ],
            [
                global.display,
                'in-fullscreen-changed',
                Lang.bind(this, this._updateBarrier)
            ],
            [
                workspaceManager,
                'workspace-added',
                Lang.bind(this, this._onWorkspaceAdded)
            ],
            [
                workspaceManager,
                'workspace-removed',
                Lang.bind(this, this._onWorkspaceRemoved)
            ]
        );
        if (_DEBUG_) global.log("dockedWorkspaces: init - signals being captured");

        // Bind keyboard shortcuts
        if (this._settings.get_boolean('toggle-dock-with-keyboard-shortcut'))
            this._bindDockKeyboardShortcut();

        // Connect DashToDock hover signal if the extension is already loaded and enabled
        this._hoveringDash = false;
        DashToDockExtension = ExtensionUtils.extensions[DashToDock_UUID];
        if (DashToDockExtension) {
            if (DashToDockExtension.state == ExtensionSystem.ExtensionState.ENABLED) {
                if (_DEBUG_) global.log("dockeWorkspaces: init - DashToDock extension is installed and enabled");
                DashToDock = DashToDockExtension.imports.extension;
                if (DashToDock) {
                    DashToDockExtension.hasDockPositionKey = false;
                    if (DashToDock.dockManager) {
                        DashToDockExtension.hasDockPositionKey = true;
                    } else {
                        var keys = DashToDock.dock._settings.list_keys();
                        if (keys.indexOf('dock-position') > -1) {
                            DashToDockExtension.hasDockPositionKey = true;
                        }
                    }
                    this._connectDashToDockSignals();
                }
            }
        }

        // Intialize trigger spacing
        // We use this space to trigger the dock (show/hide) if the pressure barrier is not present (or disabled)
        // We also use this space for scrolling when the dock is hidden
        this._triggerWidth = 1;
        this._updateTriggerWidth();

        // Hide the dock while initializing and setting position
        // But since we need to access its width, we use opacity
        this.actor.set_opacity(0);

        // Since the actor is not a topLevel child and its parent is now not added to the Chrome,
        // the allocation change of the parent container (slide in and slideout) doesn't trigger
        // anymore an update of the input regions. Force the update manually.
        this.actor.connect('notify::allocation',
                                              Lang.bind(Main.layoutManager, Main.layoutManager._queueUpdateRegions));

        // Create struts actor for tracking workspace region of fixed dock or partially fixed dock
        this._struts = new St.Bin({ reactive: false });
        if (this._settings.get_boolean('dock-fixed')
            || (this._settings.get_boolean('intellihide') && this._settings.get_enum('intellihide-action') == IntellihideAction.SHOW_PARTIAL_FIXED)) {
                Main.uiGroup.add_child(this._struts);
                Main.layoutManager.uiGroup.set_child_below_sibling(this._struts, Main.layoutManager.modalDialogGroup);
                Main.layoutManager._trackActor(this._struts, {affectsStruts: true, trackFullscreen: true});
                // Force region update to update workspace area
                Main.layoutManager._queueUpdateRegions();
        }

        // Add aligning container without tracking it for input region (old affectsinputRegion: false that was removed).
        // The public method trackChrome requires the actor to be child of a tracked actor. Since I don't want the parent
        // to be tracked I use the private internal _trackActor instead.
        Main.uiGroup.add_child(this.actor);
        Main.layoutManager.uiGroup.set_child_below_sibling(this.actor, Main.layoutManager.modalDialogGroup);
        if (this._settings.get_boolean('dock-fixed')
            || (this._settings.get_boolean('intellihide') && this._settings.get_enum('intellihide-action') == IntellihideAction.SHOW_PARTIAL_FIXED)) {
                Main.layoutManager._trackActor(this._slider.actor, {trackFullscreen: true});
        } else {
            if (this._settings.get_boolean('autohide-in-fullscreen')) {
                Main.layoutManager._trackActor(this._slider.actor);
            } else {
                Main.layoutManager._trackActor(this._slider.actor, {trackFullscreen: true});
            }
        }
    },

    _initialize: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: initializing * * * * *");
        if(this._realizeId > 0){
            this.actor.disconnect(this._realizeId);
            this._realizeId = 0;
        }

        // Show the thumbnailsBox.  We need it to calculate the width of the dock.
        this._thumbnailsBox._createThumbnails();

        // Set shortcuts panel visibility
        if (this._settings.get_boolean('show-shortcuts-panel')) {
            this._shortcutsPanel.actor.show();
        } else {
            this._shortcutsPanel.actor.hide();
        }

        // Set initial position and opacity
        this._resetPosition();
        this.actor.set_opacity(255);

        this._disableRedisplay = false;
        if (_DEBUG_) global.log("dockedWorkspaces: initialize - turn on redisplay");

        // Now that the dock is on the stage and custom themes are loaded
        // retrieve background color and set background opacity
        this._updateAppearancePreferences();

        // Setup pressure barrier (GS38+ only)
        this._updatePressureBarrier();
        this._updateBarrier();

        // NOTE: GS3.14+ thumbnailsBox width signal triggers ealier so now we need this.
        this._redisplay();
    },

    destroy: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: destroying * * * * *");
        // Destroy thumbnailsBox & global signals
        this._thumbnailsBox._destroyThumbnails();

        this._shortcutsPanel.destroy();

        if (this._workspaceSwitcher)
            this._workspaceSwitcher.destroy();

        // Disconnect global signals
        this._signalHandler.disconnect();

        // Disconnect GSettings signals
        this._settings.run_dispose();

        // Unbind keyboard shortcuts
        this._unbindDockKeyboardShortcut();

        // Remove existing barrier
        this._removeBarrier();
        if (this._pressureBarrier) {
            if (_DEBUG_) global.log("... destroying old pressureBarrier object");
            this._pressureBarrier.destroy();
            this._pressureBarrier = null;
        }

        this._slider.destroy();

        this._struts.destroy();

        // Destroy main clutter actor: this should be sufficient
        // From clutter documentation:
        // If the actor is inside a container, the actor will be removed.
        // When you destroy a container, its children will be destroyed as well.
        this.actor.destroy();

        // Restore normal Gnome Shell functions
        this._restoreGnomeShellFunctions();
    },

    // function called during init to override gnome shell 3.4/3.6/3.8
    _overrideGnomeShellFunctions: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _overrideGnomeShellFunctions");
        let self = this;

        // Hide normal Dash
        if (this._settings.get_boolean('hide-dash')) {
            // Hide normal dash
            Main.overview._controls.dash.actor.hide();
            Main.overview._controls.dash.actor.set_width(1);
        }

        // Change source of swarm animation to shortcuts panel apps button
        GSFunctions['Overview_getShowAppsButton'] = Overview.Overview.prototype.getShowAppsButton;
        Overview.Overview.prototype.getShowAppsButton = function() {
            if (self._settings.get_boolean('show-shortcuts-panel') && self._settings.get_boolean('shortcuts-panel-appsbutton-animation')) {
                return self._shortcutsPanel._appsButton.actor;
            } else {
                return this._dash.showAppsButton;
            }
        };

        // Hide normal workspaces thumbnailsBox
        Main.overview._controls._thumbnailsSlider.actor.opacity = 0;

        // Override WorkspaceSwitcherPopup _show function to prevent popup from showing when disabled
        GSFunctions['WorkspaceSwitcherPopup_show'] = WorkspaceSwitcherPopup.WorkspaceSwitcherPopup.prototype._show;
        WorkspaceSwitcherPopup.WorkspaceSwitcherPopup.prototype._show = function() {
            if (self._settings.get_boolean('hide-workspace-switcher-popup')) {
                return false;
            } else {
                let ret = GSFunctions['WorkspaceSwitcherPopup_show'].call(this);
                return ret;
            }
        };

        // Extend LayoutManager _updateRegions function to destroy/create workspace thumbnails when completed.
        // NOTE1: needed because 'monitors-changed' signal doesn't wait for queued regions to update.
        // We need to wait so that the screen workspace workarea is adjusted before creating workspace thumbnails.
        // Otherwise when we move the primary workspace to another monitor, the workspace thumbnails won't adjust for the top panel.
        // NOTE2: also needed when dock-fixed is enabled/disabled to adjust for workspace area change
        GSFunctions['LayoutManager_updateRegions'] = Layout.LayoutManager.prototype._updateRegions;
        Layout.LayoutManager.prototype._updateRegions = function() {
            let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
            let ret = GSFunctions['LayoutManager_updateRegions'].call(this);
            // SANITY CHECK:
            if (_DEBUG_) global.log("dockedWorkspaces: UPDATEREGIONS - workArea W= "+workArea.width + "  H= "+workArea.height+ "  X= "+workArea.x+ "  Y= "+workArea.y+"  CURRENT W="+self._workAreaWidth+"  H="+self._workAreaHeight+"  FORCED?="+self._refreshThumbnailsOnRegionUpdate);
            if (self._refreshThumbnailsOnRegionUpdate) {
                self._refreshThumbnailsOnRegionUpdate = false;
                self._refreshThumbnails();
            } else {
                if (self._workAreaWidth) {
                    let widthTolerance = workArea.width * .01;
                    let heightTolerance = workArea.height * .01;
                    if (self._workAreaWidth < workArea.width-widthTolerance || self._workAreaWidth > workArea.width+widthTolerance) {
                        self._refreshThumbnails();
                    } else if (self._workAreaHeight < workArea.height-heightTolerance || self._workAreaHeight > workArea.height+heightTolerance) {
                        self._refreshThumbnails();
                    }
                } else {
                    self._refreshThumbnails();
                }
            }
            return ret;

        };

        // Override geometry calculations of activities overview to use workspaces-to-dock instead of the default thumbnailsbox.
        // NOTE: This is needed for when the dock is positioned on a secondary monitor and also for when the shortcuts panel is visible
        // causing the dock to be wider than normal.
        GSFunctions['WorkspacesDisplay_updateWorkspacesActualGeometry'] = WorkspacesView.WorkspacesDisplay.prototype._updateWorkspacesActualGeometry;
        WorkspacesView.WorkspacesDisplay.prototype._updateWorkspacesActualGeometry = function() {
            if (_DEBUG_) global.log("WORKSPACESDISPLAY - _UPDATE ACTUALGEOMETRY");
            if (!this._workspacesViews.length)
                return;

            let [x, y] = this.actor.get_transformed_position();
            let allocation = this.actor.allocation;
            let width = allocation.x2 - allocation.x1;
            let height = allocation.y2 - allocation.y1;

            let spacing = Main.overview._controls.actor.get_theme_node().get_length('spacing');
            let monitors = Main.layoutManager.monitors;

            // Get Dash monitor index
            let dashMonitorIndex = this._primaryIndex;
            let dashMultiMonitor = false;
            if (DashToDock) {
                if (DashToDock.dockManager) {
                    dashMonitorIndex = DashToDock.dockManager._preferredMonitorIndex;
                    dashMultiMonitor = DashToDock.dockManager._settings.get_boolean('multi-monitor');
                } else {
                    dashMonitorIndex = DashToDock.dock._settings.get_int('preferred-monitor');
                    if (dashMonitorIndex < 0 || dashMonitorIndex >= Main.layoutManager.monitors.length) {
                        dashMonitorIndex = this._primaryIndex;
                    }
                }
            }

            // Get thumbnails monitor index
            let preferredMonitorIndex = self._settings.get_int('preferred-monitor');
            let thumbnailsMonitorIndex = (Main.layoutManager.primaryIndex + preferredMonitorIndex) % Main.layoutManager.monitors.length ;

            // Iterate through monitors
            for (let i = 0; i < monitors.length; i++) {
                let geometry = { x: monitors[i].x, y: monitors[i].y, width: monitors[i].width, height: monitors[i].height };

                // Adjust index to point to correct dock
                // Only needed when using DashToDock.dockManager
                let idx;
                if (i == dashMonitorIndex || dashMultiMonitor) {
                    idx = 0;
                } else if (i < dashMonitorIndex) {
                    idx = i + 1;
                }

                // Adjust width for dash
                let dashWidth = 0;
                let dashHeight = 0;
                let monitorHasDashDock = false;
                if (DashToDock) {
                    if (DashToDock.dockManager) {
                        if (DashToDock.dockManager._allDocks[0]) {
                            if (i == dashMonitorIndex || dashMultiMonitor) {
                                monitorHasDashDock = true;
                                if (DashToDock.dockManager._allDocks[idx]._position == St.Side.LEFT ||
                                    DashToDock.dockManager._allDocks[idx]._position == St.Side.RIGHT) {
                                        dashWidth = DashToDock.dockManager._allDocks[idx]._box.width + spacing;
                                }
                                if (DashToDock.dockManager._allDocks[idx]._position == St.Side.TOP ||
                                    DashToDock.dockManager._allDocks[idx]._position == St.Side.BOTTOM) {
                                        dashHeight = DashToDock.dockManager._allDocks[idx]._box.height + spacing;
                                }
                            }
                        }
                    } else {
                        if (i == dashMonitorIndex) {
                            monitorHasDashDock = true;
                            if (DashToDockExtension.hasDockPositionKey)  {
                                if (DashToDock.dock._position == St.Side.LEFT ||
                                    DashToDock.dock._position == St.Side.RIGHT) {
                                        dashWidth = DashToDock.dock._box.width + spacing;
                                }
                                if (DashToDock.dock._position == St.Side.TOP ||
                                    DashToDock.dock._position == St.Side.BOTTOM) {
                                        dashHeight = DashToDock.dock._box.height + spacing;
                                }
                            } else {
                                dashWidth = DashToDock.dock._box.width + spacing;
                            }
                        }
                    }
                } else {
                    if (!self._settings.get_boolean('hide-dash') &&
                        i == this._primaryIndex) {
                        dashWidth = Main.overview._controls._dashSlider.getVisibleWidth() + spacing;
                    }
                }

                // Adjust width for workspaces thumbnails
                let thumbnailsWidth = 0;
                let thumbnailsHeight = 0;
                let monitorHasThumbnailsDock = false;
                if (i == thumbnailsMonitorIndex) {
                    monitorHasThumbnailsDock = true;
                    let fixedPosition = self._settings.get_boolean('dock-fixed');
                    let overviewAction = self._settings.get_enum('overview-action');
                    let visibleEdge = self._triggerWidth;
                    if (self._settings.get_boolean('dock-edge-visible')) {
                        visibleEdge = self._triggerWidth + DOCK_EDGE_VISIBLE_WIDTH;
                    }
                    if (self._position == St.Side.LEFT ||
                        self._position == St.Side.RIGHT) {
                            if (fixedPosition) {
                                thumbnailsWidth = self.actor.get_width() + spacing;
                            } else {
                                if (overviewAction == OverviewAction.HIDE) {
                                    thumbnailsWidth = visibleEdge;
                                } else if (overviewAction == OverviewAction.SHOW_PARTIAL) {
                                    thumbnailsWidth = self._slider.partialSlideoutSize;
                                } else {
                                    thumbnailsWidth = self.actor.get_width() + spacing;
                                }
                            }
                    }
                    if (self._position == St.Side.TOP ||
                        self._position == St.Side.BOTTOM) {
                            if (fixedPosition) {
                                thumbnailsHeight = self.actor.get_height() + spacing;
                            } else {
                                if (overviewAction == OverviewAction.HIDE) {
                                    thumbnailsHeight = visibleEdge;
                                } else if (overviewAction == OverviewAction.SHOW_PARTIAL) {
                                    thumbnailsHeight = self._slider.partialSlideoutSize;
                                } else {
                                    thumbnailsHeight = self.actor.get_height() + spacing;
                                }
                            }
                    }
                }

                // Adjust x and width for workspacesView geometry
                let controlsWidth = dashWidth + thumbnailsWidth;
                if (DashToDock && DashToDockExtension.hasDockPositionKey) {
                    if (DashToDock.dockManager) {
                        if (DashToDock.dockManager._allDocks[0]) {
                            // What if dash and thumbnailsbox are both on the same side?
                            if ((monitorHasDashDock && DashToDock.dockManager._allDocks[idx]._position == St.Side.LEFT) &&
                                (monitorHasThumbnailsDock && self._position == St.Side.LEFT)) {
                                    controlsWidth = Math.max(dashWidth, thumbnailsWidth);
                                    geometry.x += controlsWidth;
                            } else {
                                if (monitorHasDashDock && DashToDock.dockManager._allDocks[idx]._position == St.Side.LEFT) {
                                    geometry.x += dashWidth;
                                }
                                if (monitorHasThumbnailsDock && self._position == St.Side.LEFT) {
                                    geometry.x += thumbnailsWidth;
                                }
                            }
                            if ((monitorHasDashDock && DashToDock.dockManager._allDocks[idx]._position == St.Side.RIGHT) &&
                                (monitorHasThumbnailsDock && self._position == St.Side.RIGHT)) {
                                    controlsWidth = Math.max(dashWidth, thumbnailsWidth);
                            }
                        }
                    } else {
                        // What if dash and thumbnailsbox are both on the same side?
                        if ((monitorHasDashDock && DashToDock.dock._position == St.Side.LEFT) &&
                            (monitorHasThumbnailsDock && self._position == St.Side.LEFT)) {
                                controlsWidth = Math.max(dashWidth, thumbnailsWidth);
                                geometry.x += controlsWidth;
                        } else {
                            if (monitorHasDashDock && DashToDock.dock._position == St.Side.LEFT) {
                                geometry.x += dashWidth;
                            }
                            if (monitorHasThumbnailsDock && self._position == St.Side.LEFT) {
                                geometry.x += thumbnailsWidth;
                            }
                        }
                        if ((monitorHasDashDock && DashToDock.dock._position == St.Side.RIGHT) &&
                            (monitorHasThumbnailsDock && self._position == St.Side.RIGHT)) {
                                controlsWidth = Math.max(dashWidth, thumbnailsWidth);
                        }
                    }
                } else {
                    if (this.actor.get_text_direction() == Clutter.TextDirection.LTR) {
                        if (monitorHasThumbnailsDock && self._position == St.Side.LEFT) {
                            controlsWidth = Math.max(dashWidth, thumbnailsWidth);
                            geometry.x += controlsWidth;
                        } else {
                            geometry.x += dashWidth;
                        }
                    } else {
                        if (monitorHasThumbnailsDock && self._position == St.Side.RIGHT) {
                            controlsWidth = Math.max(dashWidth, thumbnailsWidth);
                        } else {
                            geometry.x += thumbnailsWidth;
                        }
                    }
                }
                geometry.width -= controlsWidth;

                // Adjust y and height for workspacesView geometry for primary monitor (top panel, etc.)
                if (i == this._primaryIndex) {
                    geometry.y = y;
                    geometry.height = height;
                }

                // What if dash and thumbnailsBox are not on the primary monitor?
                let controlsHeight = dashHeight + thumbnailsHeight;
                if (DashToDock && DashToDockExtension.hasDockPositionKey) {
                    if (DashToDock.dockManager) {
                        if (DashToDock.dockManager._allDocks[0]) {
                            if ((monitorHasDashDock && DashToDock.dockManager._allDocks[idx]._position == St.Side.TOP) &&
                                (monitorHasThumbnailsDock && self._position == St.Side.TOP)) {
                                    controlsHeight = Math.max(dashHeight, thumbnailsHeight);
                                    geometry.y += controlsHeight;
                            } else {
                                if (monitorHasDashDock && DashToDock.dockManager._allDocks[idx]._position == St.Side.TOP) {
                                    geometry.y += dashHeight;
                                }
                                if (monitorHasThumbnailsDock && self._position == St.Side.TOP) {
                                    geometry.y += thumbnailsHeight;
                                }
                            }
                            if ((monitorHasDashDock && DashToDock.dockManager._allDocks[idx]._position == St.Side.BOTTOM) &&
                                (monitorHasThumbnailsDock && self._position == St.Side.BOTTOM)) {
                                    controlsHeight = Math.max(dashHeight, thumbnailsHeight);
                            }
                        }
                    } else {
                        if ((monitorHasDashDock && DashToDock.dock._position == St.Side.TOP) &&
                            (monitorHasThumbnailsDock && self._position == St.Side.TOP)) {
                                controlsHeight = Math.max(dashHeight, thumbnailsHeight);
                                geometry.y += controlsHeight;
                        } else {
                            if (monitorHasDashDock && DashToDock.dock._position == St.Side.TOP) {
                                geometry.y += dashHeight;
                            }
                            if (monitorHasThumbnailsDock && self._position == St.Side.TOP) {
                                geometry.y += thumbnailsHeight;
                            }
                        }
                        if ((monitorHasDashDock && DashToDock.dock._position == St.Side.BOTTOM) &&
                            (monitorHasThumbnailsDock && self._position == St.Side.BOTTOM)) {
                                controlsHeight = Math.max(dashHeight, thumbnailsHeight);
                        }
                    }
                } else {
                    if (monitorHasThumbnailsDock && self._position == St.Side.TOP) {
                        geometry.y += thumbnailsHeight;
                    }
                }
                geometry.height -= controlsHeight;


                if (_DEBUG_) global.log("MONITOR = "+i);
                this._workspacesViews[i].setMyActualGeometry(geometry);
            }
        };

        // This override is needed to prevent calls from updateWorkspacesActualGeometry bound to the workspacesDisplay object
        // without destroying and recreating Main.overview.viewSelector._workspacesDisplay.
        // We replace this function with a new setMyActualGeometry function (see below)
        // TODO: This is very hackish. We need to find a better way to accomplish this
        GSFunctions['WorkspacesViewBase_setActualGeometry'] = WorkspacesView.WorkspacesViewBase.prototype.setActualGeometry;
        WorkspacesView.WorkspacesViewBase.prototype.setActualGeometry = function(geom) {
            if (_DEBUG_) global.log("WORKSPACESVIEW - setActualGeometry");
            //GSFunctions['WorkspacesView_setActualGeometry'].call(this, geom);
            return;
        };

        // This additional function replaces the WorkspacesView setActualGeometry function above.
        // TODO: This is very hackish. We need to find a better way to accomplish this
        WorkspacesView.WorkspacesViewBase.prototype.setMyActualGeometry = function(geom) {
            if (_DEBUG_) global.log("WORKSPACESVIEW - setMyActualGeometry");
            this._actualGeometry = geom;
            this._syncActualGeometry();
        };

        this._overrideComplete = true;
    },

    // function called during destroy to restore gnome shell 3.4/3.6/3.8
    _restoreGnomeShellFunctions: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _restoreGnomeShellFunctions");
        // Restore normal Dash
        if (this._settings.get_boolean('hide-dash') &&
            (!DashToDock || !DashToDock.dock)) {
                // Show normal dash (if no dash-to-dock)
                Main.overview._controls.dash.actor.show();
                Main.overview._controls.dash.actor.set_width(-1);
                // This forces the recalculation of the icon size
                Main.overview._controls.dash._maxHeight = -1;
        }

        // Restore source of swarm animation to normal apps button
        Overview.Overview.prototype.getShowAppsButton = GSFunctions['Overview_getShowAppsButton'];

        // Show normal workspaces thumbnailsBox
        Main.overview._controls._thumbnailsSlider.actor.opacity = 255;

        // Restore normal WorkspaceSwitcherPopup_show function
        WorkspaceSwitcherPopup.WorkspaceSwitcherPopup.prototype._show = GSFunctions['WorkspaceSwitcherPopup_show'];

        // Restore normal LayoutManager _updateRegions function
        // Layout.LayoutManager.prototype._queueUpdateRegions = GSFunctions['LayoutManager_queueUpdateRegions'];
        Layout.LayoutManager.prototype._updateRegions = GSFunctions['LayoutManager_updateRegions'];

        // Restore normal WorkspacesDisplay _updateworksapgesActualGeometray function
        WorkspacesView.WorkspacesDisplay.prototype._updateWorkspacesActualGeometry = GSFunctions['WorkspacesDisplay_updateWorkspacesActualGeometry'];

        // Restore normal WorkspacesView _setActualGeometry function
        WorkspacesView.WorkspacesViewBase.prototype.setActualGeometry = GSFunctions['WorkspacesViewBase_setActualGeometry'];
        WorkspacesView.WorkspacesViewBase.prototype.setMyActualGeometry = null;
    },

    // handler for when shortcuts panel is updated
    _onShortcutsPanelUpdated: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onShortcutsPanelUpdated");
        this._updateSize();
        this._redisplay();
    },

    // handler for when thumbnailsBox is resized
    _thumbnailsBoxResized: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _thumbnailsBoxResized");
        this._updateSize();
        this._redisplay();
    },

    // handler for when dock y position is updated
    _updateYPosition: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _updateYPosition");
        this._updateSize();
    },

    // handler for when workspaces are added
    _onWorkspaceAdded: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onWorkspaceAdded");
        this._updateSize();
        this._redisplay();
    },

    // handler for when workspaces are removed
    _onWorkspaceRemoved: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onWorkspaceRemoved");
        this._updateSize();
        this._redisplay();
    },

    _updateTriggerWidth: function(force) {
        if (_DEBUG_) global.log("dockedWorkspaces: _updateTriggerWidth");
        // Calculate and set triggerWidth
        let previousTriggerWidth = this._triggerWidth;
        if (this._settings.get_boolean('dock-fixed')) {
            this._triggerWidth = 0;
        } else if (this._settings.get_boolean('intellihide') && this._settings.get_enum('intellihide-action') == IntellihideAction.SHOW_PARTIAL_FIXED) {
            this._triggerWidth = 1;
        } else {
            if (!this._settings.get_boolean('dock-edge-visible') &&
                 this._settings.get_boolean('require-pressure-to-show') &&
                 this._settings.get_boolean('disable-scroll')) {
                    if (this._pressureSensed) {
                        this._triggerWidth = 1;
                    } else if (this._dockState == DockState.SHOWN) {
                        this._triggerWidth = 1;
                    } else {
                        this._triggerWidth = 0;
                    }
            } else {
                this._triggerWidth = 1;
            }
        }

        if (previousTriggerWidth == this._triggerWidth && !force)
            return;

        if (!this._disableRedisplay)
            this._updateSize();
    },

    // handler for when dock height is updated
    _updateHeight: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _updateHeight");
        this._updateSize();
    },

    // handler to bind settings when preferences changed
    _bindSettingsChanges: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _bindSettingsChanges");
        this._settings.connect('changed::opaque-background', Lang.bind(this, function() {
            this._updateBackgroundOpacity();
        }));

        this._settings.connect('changed::background-opacity', Lang.bind(this, function() {
            this._updateBackgroundOpacity();
        }));

        this._settings.connect('changed::straight-corners', Lang.bind(this, function() {
            this._updateStraightCorners();
        }));

        this._settings.connect('changed::autohide', Lang.bind(this, function() {
            this.emit('box-changed');
            this._updateBarrier();
        }));

        this._settings.connect('changed::preferred-monitor', Lang.bind(this, function() {
            this._resetPosition();
            this._redisplay();
        }));

        this._settings.connect('changed::hide-dash', Lang.bind(this, function() {
            if (this._settings.get_boolean('hide-dash')) {
                Main.overview._controls.dash.actor.hide();
                Main.overview._controls.dash.actor.set_width(1);
            } else {
                if (!DashToDock) {
                    // Show normal dash (if no dash-to-dock)
                    Main.overview._controls.dash.actor.show();
                    Main.overview._controls.dash.actor.set_width(-1);
                    // This forces the recalculation of the icon size
                    Main.overview._controls.dash._maxHeight = -1;
                }
            }
        }));

        this._settings.connect('changed::show-shortcuts-panel', Lang.bind(this, function() {
            let shortcutsPanelOrientation = this._settings.get_enum('shortcuts-panel-orientation');
            if (this._settings.get_boolean('show-shortcuts-panel')) {
                if (shortcutsPanelOrientation == 1) {
                    this._dock.add_style_class_name('inside');
                }
                this._shortcutsPanel.actor.show();
            } else {
                if (shortcutsPanelOrientation == 1) {
                    this._dock.remove_style_class_name('inside');
                }
                this._shortcutsPanel.actor.hide();
            }
            this._updateSize();
            this._redisplay();
        }));

        this._settings.connect('changed::shortcuts-panel-icon-size', Lang.bind(this, function() {
            this._shortcutsPanel.refresh();
            this._updateSize();
            this._redisplay();
        }));

        this._settings.connect('changed::shortcuts-panel-show-running', Lang.bind(this, function() {
            this._shortcutsPanel.refresh();
            this._updateSize();
            this._redisplay();
        }));

        this._settings.connect('changed::shortcuts-panel-show-places', Lang.bind(this, function() {
            this._shortcutsPanel.refresh();
            this._updateSize();
            this._redisplay();
        }));

        this._settings.connect('changed::dock-edge-visible', Lang.bind(this, function() {
            this._updateTriggerWidth(true);
            this._redisplay();
        }));

        this._settings.connect('changed::require-pressure-to-show', Lang.bind(this, function() {
            this._updateTriggerWidth(true);
            this._redisplay();
        }));
        this._settings.connect('changed::pressure-threshold', Lang.bind(this, function() {
            this._updatePressureBarrier();
            this._updateBarrier();
        }));

        this._settings.connect('changed::use-pressure-speed-limit', Lang.bind(this, function() {
            this._updatePressureBarrier();
            this._updateBarrier();
        }));
        this._settings.connect('changed::pressure-speed-limit', Lang.bind(this, function() {
            this._updatePressureBarrier();
            this._updateBarrier();
        }));

        this._settings.connect('changed::disable-scroll', Lang.bind(this, function() {
            this._updateTriggerWidth(true);
            this._redisplay();
        }));

        this._settings.connect('changed::screen-edge-padding', Lang.bind(this, function() {
            this._updateSize();
            this._redisplay();
        }));

        this._settings.connect('changed::customize-thumbnail', Lang.bind(this, function() {
            // hide and show thumbnailsBox to resize thumbnails
            this._refreshThumbnails();
        }));

        this._settings.connect('changed::thumbnail-size', Lang.bind(this, function() {
            // hide and show thumbnailsBox to resize thumbnails
            this._refreshThumbnails();
        }));
        this._settings.connect('changed::customize-thumbnail-visible-width', Lang.bind(this, function() {
            this._updateTriggerWidth(true);
            this._redisplay();
        }));
        this._settings.connect('changed::thumbnail-visible-width', Lang.bind(this, function() {
            this._updateTriggerWidth(true);
            this._redisplay();
        }));
        this._settings.connect('changed::workspace-captions', Lang.bind(this, function() {
            // hide and show thumbnailsBox to reset workspace apps in caption
            this._refreshThumbnails();
        }));
        this._settings.connect('changed::workspace-caption-position', Lang.bind(this, function() {
            // hide and show thumbnailsBox to reset workspace apps in caption
            this._refreshThumbnails();
        }));
        this._settings.connect('changed::workspace-caption-height', Lang.bind(this, function() {
            // hide and show thumbnailsBox to reset workspace apps in caption
            this._refreshThumbnails();
        }));
        this._settings.connect('changed::workspace-caption-items', Lang.bind(this, function() {
            // hide and show thumbnailsBox to reset workspace apps in caption
            this._refreshThumbnails();
        }));
        this._settings.connect('changed::workspace-caption-windowcount-image', Lang.bind(this, function() {
            // hide and show thumbnailsBox to reset workspace apps in caption
            this._refreshThumbnails();
        }));
        this._settings.connect('changed::workspace-caption-taskbar-icon-size', Lang.bind(this, function() {
            // hide and show thumbnailsBox to reset workspace apps in caption
            this._refreshThumbnails();
        }));
        this._settings.connect('changed::top-margin', Lang.bind(this, function() {
            // Add or remove addtional style class when workspace is fixed and set to full height
            if (this._settings.get_boolean('customize-height') && this._settings.get_int('customize-height-option') == 1) {
                if (this._settings.get_double('top-margin') == 0 || this._settings.get_double('bottom-margin') == 0) {
                    this._dock.add_style_class_name('fullheight');
                } else {
                    this._dock.remove_style_class_name('fullheight');
                }
            } else {
                this._dock.remove_style_class_name('fullheight');
            }
            this._updateSize();
        }));
        this._settings.connect('changed::bottom-margin', Lang.bind(this, function() {
            // Add or remove addtional style class when workspace is fixed and set to full height
            if (this._settings.get_boolean('customize-height') && this._settings.get_int('customize-height-option') == 1) {
                if (this._settings.get_double('top-margin') == 0 || this._settings.get_double('bottom-margin') == 0) {
                    this._dock.add_style_class_name('fullheight');
                } else {
                    this._dock.remove_style_class_name('fullheight');
                }
            } else {
                this._dock.remove_style_class_name('fullheight');
            }
            this._updateSize();
        }));
        this._settings.connect('changed::toggle-dock-with-keyboard-shortcut', Lang.bind(this, function(){
            if (this._settings.get_boolean('toggle-dock-with-keyboard-shortcut'))
                this._bindDockKeyboardShortcut();
            else
                this._unbindDockKeyboardShortcut();
        }));
    },

    _updatePressureBarrier: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _updatePressureBarrier");
        let self = this;
        this._canUsePressure = global.display.supports_extended_barriers();
        let pressureThreshold = this._settings.get_double('pressure-threshold');

        let speedLimit;
        if (this._settings.get_boolean('use-pressure-speed-limit'))
            speedLimit = this._settings.get_double('pressure-speed-limit');

        // Remove existing pressure barrier
        if (this._pressureBarrier) {
            if (_DEBUG_) global.log("... destroying old pressureBarrier object");
            this._pressureBarrier.destroy();
            this._pressureBarrier = null;
        }

        // Create new pressure barrier based on pressure threshold setting
        if (this._canUsePressure) {
            if (_DEBUG_) global.log("... creating pressureBarrier object");
            this._pressureBarrier = new MyPressureBarrier.myPressureBarrier(pressureThreshold, speedLimit, PRESSURE_TIMEOUT,
                                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW);
            this._pressureBarrier.connect('trigger', function(barrier){
                self._onPressureSensed();
            });
            this._pressureBarrier.connect('speed-exceeded', function(barrier){
                self._onSpeedExceeded();
            });
            if (_DEBUG_) global.log("dockedWorkspaces: init - canUsePressure = "+this._canUsePressure);
        }
    },

    _bindDockKeyboardShortcut: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _bindDockKeyboardShortcut");
        Main.wm.addKeybinding('dock-keyboard-shortcut', this._settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL,
            Lang.bind(this, function() {
                if (_DEBUG_) global.log("KEYBOARD SHORTCUT PRESSED autohideStatus = "+this._autohideStatus);
                if (this._autohideStatus) {
                    if (this._dockState == DockState.HIDDEN || this._dockState == DockState.HIDING) {
                        this._toggleWithKeyboard(true);
                    } else {
                        this._toggleWithKeyboard(false);
                    }
                } else {
                    if (this._dockState == DockState.SHOWN || this._dockState == DockState.SHOWING) {
                        this._toggleWithKeyboard(false);
                    } else {
                        this._toggleWithKeyboard(true);
                    }
                }
            })
        );
    },

    _toggleWithKeyboard: function(show) {
        if (_DEBUG_) global.log("dockedWorkspaces: _toggleWithKeyboard");
        // Clear keyboard toggle timeout
        if (this._toggleWithKeyboardTimeoutId > 0) {
            Mainloop.source_remove(this._toggleWithKeyboardTimeoutId);
            this._toggleWithKeyboardTimeoutId = 0;
        }

        // Hide dock after timeout
        if (show) {
            this._show();
            let timeout = this._settings.get_double('keyboard-toggle-timeout') * 1000;
            this._toggleWithKeyboardTimeoutId = Mainloop.timeout_add(timeout, Lang.bind(this, function(){
                this._toggleWithKeyboard(false);
            }));
        } else {
            this._hide();
        }
    },

    _unbindDockKeyboardShortcut: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _unbindDockKeyboardShortcut");
        Main.wm.removeKeybinding('dock-keyboard-shortcut');
    },

    // Determine if mouse is hovering dock container
    _isHovering: function() {
        if (this._dock.hover) {
            if (_DEBUG_) global.log("dockedWorkspaces: _isHovering DOCK true");
            return true;
        } else {
            if (_DEBUG_) global.log("dockedWorkspaces: _isHovering DOCK false");
            return false;
        }
    },

    // handler for mouse hover events
    _hoverChanged: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _hoverChanged - isHovering = "+this._isHovering()+" autohideStatus-dodging = "+this._autohideStatus+" dockState = "+getDockStateDesc(this._dockState)+" pSensed="+this._pressureSensed+" barrier="+this._barrier);
        if (this._settings.get_boolean('dock-fixed')) {
            return;
        }


        if (this._canUsePressure && this._settings.get_boolean('require-pressure-to-show') && this._barrier) {
            if (this._pressureSensed == false && this._dockState != DockState.SHOWN) {
                if (_DEBUG_) global.log("dockedWorkspaces: _hoverChanged - presureSensed = "+this._pressureSensed+" RETURN");
                if (this._isHovering()) {
                    return;
                }
            }
        }

        if (this._settings.get_boolean('require-click-to-show')) {
            // check if metaWin is maximized
            let workspaceManager = global.workspace_manager;
            let activeWorkspace = workspaceManager.get_active_workspace();
            let maximized = false;
            let windows = global.get_window_actors();
            for (let i = windows.length-1; i >= 0; i--) {
                let metaWin = windows[i].get_meta_window();
                if (metaWin.get_workspace() == activeWorkspace) {
                    if(_DEBUG_) global.log("dockedWorkspaces: _hoverChanged - window is on active workspace");
                    if(_DEBUG_) global.log("dockedWorkspaces: _hoverChanged - window class = "+metaWin.get_wm_class());
                    if (metaWin.appears_focused && metaWin.maximized_horizontally) {
                        maximized = true;
                        if (_DEBUG_) global.log("dockedWorkspaces: _hoverChanged - window is focused and maximized");
                        break;
                    }
                }
            }
            // set hovering flag if maximized
            // used by the _onDockClicked function (hover+click)
            if (maximized) {
                if (this._isHovering()) {
                    this._hovering = true;
                    if (this._dockState != DockState.SHOWN) {
                        return;
                    }
                } else {
                    this._hovering = false;
                }
            } else {
                this._hovering = false;
            }
        }

        //Skip if dock is not in autohide mode for instance because it is shown by intellihide
        if (_DEBUG_) global.log("dockedWorkspaces: _hoverChanged - show or hide?");
        if (this._settings.get_boolean('autohide')) {
            if (this._isHovering()) {
                if (_DEBUG_) global.log("dockedWorkspaces: _hoverChanged - show");
                this._show();
            } else {
                if (_DEBUG_) global.log("dockedWorkspaces: _hoverChanged - hide");
                this._hide();
            }
        } else {
            this._hide();
        }
    },

    _checkHoverStatus: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _checkHoverStatus");
        if (this._checkHoverStatusId > 0) {
            Mainloop.source_remove(this._checkHoverStatusId);
            this._checkHoverStatusId = 0;
        }
        if (Extension.intellihide._toggledOverviewOnDrag == false) {
            if (this._toggleWithKeyboardTimeoutId == 0) {
                this._hoverChanged();
            }
        }
    },

    // handler for mouse click events - works in conjuction with hover event to show dock for maxmized windows
    _onDockClicked: function(actor, event) {
        if (_DEBUG_) global.log("dockedWorkspaces: _onDockClicked");

        // Show overview if button is right click
        if (this._settings.get_boolean('toggle-overview')) {
            let button = event.get_button();
            if (button == 3) { //right click
                if (Main.overview.visible) {
                    Main.overview.hide(); // force normal mode
                } else {
                    Main.overview.show(); // force overview mode
                }
                // pass right-click event on allowing it to bubble up
                return Clutter.EVENT_PROPAGATE;
            }
        }

        if (this._settings.get_boolean('require-click-to-show')) {
            if (this._hovering) {
                //Skip if dock is not in autohide mode for instance because it is shown by intellihide
                if (this._settings.get_boolean('autohide') && this._autohideStatus) {
                    if (this._isHovering()) {
                        this._show();
                    } else {
                        this._hide();
                    }
                }
                this._hovering = false;
            }
        }
        return Clutter.EVENT_STOP;
    },

    _onSpeedExceeded: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onSpeedExceeded");
        // FIX ISSUE: #23
        // Remove barrier so that mouse pointer can access monitors on other side of dock quickly
        // --------------
        // CONTINUE IF
        // dock NOT in single monitor config
        // dock NOT on first monitor && in left position
        // dock NOT on last monitor && in right position
        if (this._settings.get_boolean('use-pressure-speed-limit')) {
            if ((Main.layoutManager.monitors.length > 1) &&
                !(this._monitor == 0 && this._position == St.Side.LEFT) &&
                !(this._monitor == Main.layoutManager.monitors.length-1 && this._position == St.Side.RIGHT)) {

                // Remove barrier immediately
                this._removeBarrier();

                // Restore barrier after short timeout
                if (this._restoreBarrierTimeoutId > 0) {
                    Mainloop.source_remove(this._restoreBarrierTimeoutId);
                    this._restoreBarrierTimeoutId = 0;
                }
                this._restoreBarrierTimeoutId = Mainloop.timeout_add(500, Lang.bind(this, this._updateBarrier));
            }
        }
    },

    // handler for mouse pressure sensed (GS38+ only)
    _onPressureSensed: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onPressureSensed");
        this._pressureSensed = true;
        this._updateTriggerWidth();
        this._hoverChanged();
    },

    _onDashToDockShowing: function() {
        if (_DEBUG_) global.log("Dash SHOWING");
        //Skip if dock is not in dashtodock hover mode
        if (this._settings.get_boolean('dashtodock-hover')) {
            if (DashToDock && Main.overview.visible == false) {
                if (DashToDock.dockManager) {
                    if (DashToDock.dockManager._allDocks[0]._box.hover) {
                        this._hoveringDash = true;
                        this._show();
                    }
                } else {
                    if (DashToDock.dock._box.hover) {
                        this._hoveringDash = true;
                        this._show();
                    }
                }
            }
        }
    },

    _onDashToDockHiding: function() {
        if (_DEBUG_) global.log("Dash HIDING");
        //Skip if dock is not in dashtodock hover mode
        if (this._settings.get_boolean('dashtodock-hover')) {
            if (DashToDock) {
                this._hoveringDash = false;
                this._hide();
            }
        }
    },

    _onDashToDockLeave: function() {
        if (_DEBUG_) global.log("Dash Button LEAVE");
        // NOTE: Causing workspaces-to-dock to hide when switching workspaces in Gnome 3.14.
        // Remove until a workaround can be found.
        // this._hoveringDash = false;
    },

    // handler for DashToDock hover events
    _onDashToDockHoverChanged: function() {
        if (_DEBUG_) global.log("Dash HOVER Changed");
        //Skip if dock is not in dashtodock hover mode
        if (this._settings.get_boolean('dashtodock-hover')) {
            if (DashToDock) {
                if (DashToDock.dockManager) {
                    if (DashToDock.dockManager._allDocks[0]._box.hover) {
                        if (Main.overview.visible == false) {
                            this._hoveringDash = true;
                            this._show();
                        }
                    } else {
                        this._hoveringDash = false;
                        this._hide();
                    }
                } else {
                    if (DashToDock.dock._box.hover) {
                        if (Main.overview.visible == false) {
                            this._hoveringDash = true;
                            this._show();
                        }
                    } else {
                        this._hoveringDash = false;
                        this._hide();
                    }
                }
            }
        }
    },

    _onDashToDockToggled: function() {
        if (_DEBUG_) global.log("Dash TOGGLED");
        this._signalHandler.disconnectWithLabel('DashToDockHoverSignal');
        this._hoveringDash = false;
        this._connectDashToDockSignals();
    },

    _connectDashToDockSignals: function() {
        if (DashToDock) {
            // Connect DashToDock hover signal
            if (DashToDock.dockManager) {
                if (DashToDock.dockManager._allDocks[0]) {
                    this._signalHandler.pushWithLabel(
                        'DashToDockHoverSignal',
                        [
                            DashToDock.dockManager._allDocks[0]._box,
                            'notify::hover',
                            Lang.bind(this, this._onDashToDockHoverChanged)
                        ],
                        [
                            DashToDock.dockManager._allDocks[0]._box,
                            'leave-event',
                            Lang.bind(this, this._onDashToDockLeave)
                        ],
                        [
                            DashToDock.dockManager._allDocks[0],
                            'showing',
                            Lang.bind(this, this._onDashToDockShowing)
                        ],
                        [
                            DashToDock.dockManager._allDocks[0],
                            'hiding',
                            Lang.bind(this, this._onDashToDockHiding)
                        ],
                        [
                            DashToDock.dockManager,
                            'toggled',
                            Lang.bind(this, this._onDashToDockToggled)
                        ]
                    );
                }
            } else {
                this._signalHandler.pushWithLabel(
                    'DashToDockHoverSignal',
                    [
                        DashToDock.dock._box,
                        'notify::hover',
                        Lang.bind(this, this._onDashToDockHoverChanged)
                    ],
                    [
                        DashToDock.dock._box,
                        'leave-event',
                        Lang.bind(this, this._onDashToDockLeave)
                    ],
                    [
                        DashToDock.dock,
                        'showing',
                        Lang.bind(this, this._onDashToDockShowing)
                    ],
                    [
                        DashToDock.dock,
                        'hiding',
                        Lang.bind(this, this._onDashToDockHiding)
                    ]
                );
            }
        }
    },

    // handler for extensionSystem state changes
    _onExtensionSystemStateChanged: function(source, extension) {
        // Only looking for DashToDock state changes
        if (extension.uuid == DashToDock_UUID) {
            if (_DEBUG_) global.log("dockedWorkspaces: _onExtensionSystemStateChanged for "+extension.uuid+" state= "+extension.state);
            DashToDockExtension = extension;
            if (DashToDockExtension.state == ExtensionSystem.ExtensionState.ENABLED) {
                DashToDock = DashToDockExtension.imports.extension;
                if (DashToDock) {
                    DashToDockExtension.hasDockPositionKey = false;
                    if (DashToDock.dockManager) {
                        DashToDockExtension.hasDockPositionKey = true;
                    } else {
                        var keys = DashToDock.dock._settings.list_keys();
                        if (keys.indexOf('dock-position') > -1) {
                            DashToDockExtension.hasDockPositionKey = true;
                        }
                    }
                    this._connectDashToDockSignals();
                }
            } else if (extension.state == ExtensionSystem.ExtensionState.DISABLED || extension.state == ExtensionSystem.ExtensionState.UNINSTALLED) {
                DashToDock = null;
                this._signalHandler.disconnectWithLabel('DashToDockHoverSignal');
                this._hoveringDash = false;
            }
        }
    },

    // handler for mouse scroll events
    // Switches workspace by scrolling over the dock
    // This comes from desktop-scroller@obsidien.github.com
    _onScrollEvent: function (actor, event) {
        if (_DEBUG_) global.log("dockedWorkspaces: _onScrollEvent autohideStatus = "+this._autohideStatus+" dockState = "+this._dockState + " slidex = "+this._slider.slidex);
        if (this._settings.get_boolean('disable-scroll') &&
            this._autohideStatus &&
            this._slider.slidex == 0 && // Need to check the slidex for partially showing dock
            (this._dockState == DockState.HIDDEN || this._dockState == DockState.HIDING))
                return Clutter.EVENT_STOP;

        let workspaceManager = global.workspace_manager;
        let activeWs = workspaceManager.get_active_workspace();
        let direction;
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
            if (this._isHorizontal && this._settings.get_boolean('horizontal-workspace-switching')) {
                direction = Meta.MotionDirection.LEFT;
            } else {
                direction = Meta.MotionDirection.UP;
            }
            break;
        case Clutter.ScrollDirection.DOWN:
            if (this._isHorizontal && this._settings.get_boolean('horizontal-workspace-switching')) {
                direction = Meta.MotionDirection.RIGHT;
            } else {
                direction = Meta.MotionDirection.DOWN;
            }
            break;
        case Clutter.ScrollDirection.LEFT:
            if (this._isHorizontal && this._settings.get_boolean('horizontal-workspace-switching')) {
                direction = Meta.MotionDirection.LEFT;
            }
            break;
        case Clutter.ScrollDirection.RIGHT:
            if (this._isHorizontal && this._settings.get_boolean('horizontal-workspace-switching')) {
                direction = Meta.MotionDirection.RIGHT;
            }
            break;
        }

        if (direction) {
            if (this._settings.get_boolean('scroll-with-touchpad')) {
                // passingthru67: copied from dash-to-dock
                // Prevent scroll events from triggering too many workspace switches
                // by adding a 250ms deadtime between each scroll event.
                // Usefull on laptops when using a touchpad.

                // During the deadtime do nothing
                if(this._scrollWorkspaceSwitchDeadTimeId > 0)
                    return false;
                else {
                    this._scrollWorkspaceSwitchDeadTimeId =
                        Mainloop.timeout_add(250,
                            Lang.bind(this, function() {
                                this._scrollWorkspaceSwitchDeadTimeId = 0;
                            }
                    ));
                }
            }

            let ws = activeWs.get_neighbor(direction);

            if (Main.wm._workspaceSwitcherPopup == null) {
                if (this._isHorizontal && this._settings.get_boolean('horizontal-workspace-switching')) {
                    Main.wm._workspaceSwitcherPopup = new MyWorkspaceSwitcherPopup.myWorkspaceSwitcherPopup();
                } else {
                    Main.wm._workspaceSwitcherPopup = new WorkspaceSwitcherPopup.WorkspaceSwitcherPopup();
                }
            }

            // Set the workspaceSwitcherPopup actor to non reactive,
            // to prevent it from grabbing focus away from the dock
            Main.wm._workspaceSwitcherPopup.actor.reactive = false;
            Main.wm._workspaceSwitcherPopup.connect('destroy', function() {
                Main.wm._workspaceSwitcherPopup = null;
            });

            // Do not show wokspaceSwitcher in overview
            if (!Main.overview.visible)
                Main.wm._workspaceSwitcherPopup.display(direction, ws.index());

            Main.wm.actionMoveWorkspace(ws);
        }

        return Clutter.EVENT_STOP;
    },

    // autohide function to show dock
    _show: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _show autohideStatus = "+this._autohideStatus+" dockState = "+getDockStateDesc(this._dockState));
        // Only show if dock hidden, is hiding, or is partially shown/hidden
        if (this._dockState == DockState.HIDDEN || this._dockState == DockState.HIDING || this._slider.slidex < 1) {
            this._removeAnimations();

            // If the dock is hidden, wait this._settings.get_double('show-delay') before showing it;
            // otherwise show it immediately.
            let delay = 0;
            if (this._dockState == DockState.HIDDEN)
                delay = this._settings.get_double('show-delay');

            this._animateIn(this._settings.get_double('animation-time'), delay, true);
        }
    },

    // autohide function to hide dock
    _hide: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _hide autohideStatus-dodging = "+this._autohideStatus+" dockState = "+getDockStateDesc(this._dockState));
        this._updateTriggerWidth();
        if (this._settings.get_boolean('dock-fixed')) {
            return;
        }

        if (this._isHovering() || (this._hoveringDash && !Main.overview._shown)) {
            return;
        }

        let intellihideAction = this._settings.get_enum('intellihide-action');
        if (!Main.overview._shown && intellihideAction == IntellihideAction.SHOW_FULL && !this._autohideStatus) {
            return;
        }

        let overviewAction = this._settings.get_enum('overview-action');
        if (Main.overview._shown && overviewAction == OverviewAction.SHOW_FULL && !this._autohideStatus) {
            return;
        }

        // Only hide if dock is shown, is showing, or is partially shown
        if (this._dockState == DockState.SHOWN || this._dockState == DockState.SHOWING || this._slider.slidex > 0) {
            this._removeAnimations();

            // If the dock is shown, wait this._settings.get_double('show-delay') before hiding it;
            // otherwise hide it immediately.
            let delay = 0;
            if (this._dockState == DockState.SHOWN)
                delay = this._settings.get_double('hide-delay');

            if (Main.overview._shown && Main.overview.viewSelector._activePage == Main.overview.viewSelector._workspacesPage) {
                this._animateOut(this._settings.get_double('animation-time'), delay, false);
            } else {
                this._animateOut(this._settings.get_double('animation-time'), delay, this._autohideStatus);
            }
        }
    },

    setPopupMenuFlag: function(showing) {
        if (_DEBUG_) global.log("dockedWorkspaces: setPopupMenuFlag - showing="+showing);
        this._popupMenuShowing = showing;
        if (!showing) {
            if (this._isHovering()) {
                this._dock.sync_hover();
            } else {
                this._hide();
            }
        }
    },

    // autohide function to animate the show dock process
    _animateIn: function(time, delay, force) {
        if (_DEBUG_) global.log("dockedWorkspaces: _animateIN force="+force+" dockState = "+getDockStateDesc(this._dockState));
        let sliderVariable = 1;
        let fixedPosition = this._settings.get_boolean('dock-fixed')
        let overviewAction = this._settings.get_enum('overview-action');
        let intellihideAction = this._settings.get_enum('intellihide-action');
        let intellihide = this._settings.get_boolean('intellihide')
        if (_DEBUG_) global.log("... overview="+Main.overview.visible+" - "+Main.overview._shown+" ia="+intellihideAction+" oa="+overviewAction);
        if (!force && !fixedPosition) {
            if ((Main.overview._shown && overviewAction == OverviewAction.SHOW_PARTIAL)
                || (!Main.overview._shown && intellihide && (intellihideAction == IntellihideAction.SHOW_PARTIAL || intellihideAction == IntellihideAction.SHOW_PARTIAL_FIXED))) {
                if (this._slider.partialSlideoutSize) {
                    if (_DEBUG_) global.log("... animateIn: partial="+this._slider.partialSlideoutSize);
                    let fullsize;
                    if (this._isHorizontal) {
                        fullsize = this._dock.height;
                    } else {
                        fullsize = this._dock.width;
                    }
                    if (this._settings.get_boolean('dock-edge-visible')) {
                        let triggerWidth = 1; // We need trigger width to always be set to 1
                        let slideoutSize = DOCK_EDGE_VISIBLE_WIDTH - triggerWidth;
                        sliderVariable = (this._slider.partialSlideoutSize - slideoutSize) / fullsize;
                    } else {
                        sliderVariable = this._slider.partialSlideoutSize / fullsize;
                    }
                }
            } else {
                this._dockState = DockState.SHOWING;
            }
        } else {
            this._dockState = DockState.SHOWING;
        }

        Tweener.addTween(this._slider, {
            slidex: sliderVariable,
            time: time,
            delay: delay,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                if (_DEBUG_) global.log("dockedWorkspaces: _animateIN onComplete");
                if (!force && !fixedPosition) {
                    if ((Main.overview._shown && overviewAction == OverviewAction.SHOW_PARTIAL)
                        || (!Main.overview._shown && (intellihideAction == IntellihideAction.SHOW_PARTIAL || intellihideAction == IntellihideAction.SHOW_PARTIAL_FIXED))) {
                        this._updateBarrier();
                    } else {
                        this._dockState = DockState.SHOWN;

                        // Remove barrier so that mouse pointer is released and can access monitors on other side of dock
                        // NOTE: Delay needed to keep mouse from moving past dock and re-hiding dock immediately. This
                        // gives users an opportunity to hover over the dock
                        if (this._removeBarrierTimeoutId > 0) {
                            Mainloop.source_remove(this._removeBarrierTimeoutId);
                            this._removeBarrierTimeoutId = 0;
                        }
                        this._removeBarrierTimeoutId = Mainloop.timeout_add(100, Lang.bind(this, this._removeBarrier));
                        this._updateTriggerWidth();
                    }
                } else {
                    this._dockState = DockState.SHOWN;

                    // Remove barrier so that mouse pointer is released and can access monitors on other side of dock
                    // NOTE: Delay needed to keep mouse from moving past dock and re-hiding dock immediately. This
                    // gives users an opportunity to hover over the dock
                    if (this._removeBarrierTimeoutId > 0) {
                        Mainloop.source_remove(this._removeBarrierTimeoutId);
                        this._removeBarrierTimeoutId = 0;
                    }
                    this._removeBarrierTimeoutId = Mainloop.timeout_add(100, Lang.bind(this, this._removeBarrier));
                    this._updateTriggerWidth();
                }

                // Prevent dock from getting stuck animated in when mouse is no longer hovering
                if (this._checkHoverStatusId > 0) {
                    Mainloop.source_remove(this._checkHoverStatusId);
                    this._checkHoverStatusId = 0;
                }
                this._checkHoverStatusId = Mainloop.timeout_add(100, Lang.bind(this, this._checkHoverStatus));

            })
        });
    },

    // autohide function to animate the hide dock process
    _animateOut: function(time, delay, force) {
        if (this._popupMenuShowing)
            return;

        if (_DEBUG_) global.log("dockedWorkspaces: _animateOUT force="+force+" dockState = "+getDockStateDesc(this._dockState));
        this._dockState = DockState.HIDING;

        let sliderVariable = 0;
        let fixedPosition = this._settings.get_boolean('dock-fixed')
        let overviewAction = this._settings.get_enum('overview-action');
        let intellihideAction = this._settings.get_enum('intellihide-action');
        let intellihide = this._settings.get_boolean('intellihide')
        if (_DEBUG_) global.log("... overview="+Main.overview.visible+" - "+Main.overview._shown+" ia="+intellihideAction+" oa="+overviewAction);
        if (!force && !fixedPosition) {
            if ((Main.overview._shown && overviewAction == OverviewAction.SHOW_PARTIAL)
                ||  (!Main.overview._shown && intellihide && (intellihideAction == IntellihideAction.SHOW_PARTIAL || intellihideAction == IntellihideAction.SHOW_PARTIAL_FIXED))) {
                if (this._slider.partialSlideoutSize) {
                    if (_DEBUG_) global.log("... animateOut: partial="+this._slider.partialSlideoutSize);
                    let fullsize;
                    if (this._isHorizontal) {
                        fullsize = this._dock.height;
                    } else {
                        fullsize = this._dock.width;
                    }
                    if (this._settings.get_boolean('dock-edge-visible')) {
                        let triggerWidth = 1; // We need trigger width to always be set to 1
                        let slideoutSize = DOCK_EDGE_VISIBLE_WIDTH - triggerWidth;
                        sliderVariable = (this._slider.partialSlideoutSize - slideoutSize) / fullsize;
                    } else {
                        sliderVariable = this._slider.partialSlideoutSize / fullsize;
                    }
                }
            }
        }

        Tweener.addTween(this._slider, {
            slidex: sliderVariable,
            time: time,
            delay: delay,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                if (_DEBUG_) global.log("dockedWorkspaces: _animateOUT onComplete");
                this._dockState = DockState.HIDDEN;
                this._updateBarrier();
            })
        });
    },

    // autohide function to remove show-hide animations
    _removeAnimations: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _removeAnimations");
        Tweener.removeTweens(this._slider);
    },

    // autohide function to fade out opaque background
    _fadeOutBackground: function(time, delay) {
        if (_DEBUG_) global.log("dockedWorkspaces: _fadeOutBackground");
        // CSS time is in ms
        this._thumbnailsBox.actor.set_style('transition-duration:' + time*1000 + ';' +
            'transition-delay:' + delay*1000 + ';' +
            'background-color: rgba(0,0,0,0);' +
            'border-color:' + this._defaultBorder);

        this._shortcutsPanel.actor.set_style('transition-duration:' + time*1000 + ';' +
            'transition-delay:' + delay*1000 + ';' +
            'background-color: rgba(0,0,0,0);' +
            'border-color:' + this._defaultBorder);

        this._dockContainer.set_style('transition-duration:' + time*1000 + ';' +
            'transition-delay:' + delay*1000 + ';' +
            'background-color:' + this._defaultBackground + ';' +
            'border-color:' + this._defaultBorder);
    },

    // autohide function to fade in opaque background
    _fadeInBackground: function(time, delay) {
        if (_DEBUG_) global.log("dockedWorkspaces: _fadeInBackground");
        // CSS time is in ms
        this._thumbnailsBox.actor.set_style('transition-duration:' + time*1000 + ';' +
            'transition-delay:' + delay*1000 + ';' +
            'background-color: rgba(0,0,0,0);' +
            'border-color:' + this._customBorder);

        this._shortcutsPanel.actor.set_style('transition-duration:' + time*1000 + ';' +
            'transition-delay:' + delay*1000 + ';' +
            'background-color: rgba(0,0,0,0);' +
            'border-color:' + this._customBorder);

        this._dockContainer.set_style('transition-duration:' + time*1000 + ';' +
            'transition-delay:' + delay*1000 + ';' +
            'background-color:' + this._customBackground + ';' +
            'border-color:' + this._customBorder);
    },

    // This function handles hiding the dock when dock is in stationary-fixed
    // position but overlapped by gnome panel menus or meta popup windows
    fadeOutDock: function(time, delay) {
        if (_DEBUG_) global.log("dockedWorkspaces: fadeOutDock");
        if (Main.layoutManager._inOverview) {
            // Hide fixed dock when in overviewmode applications view
            this.actor.opacity = 0;
        }

        // Make thumbnail windowclones non-reactive
        // NOTE: Need this for when in overviewmode applications view and dock is in fixed mode.
        // Fixed dock has opacity set to 0 but is still reactive.
        this._dock.reactive = false;
        this._shortcutsPanel.setReactiveState(false);
        this._thumbnailsBox.actor.reactive = false;
        for (let i = 0; i < this._thumbnailsBox._thumbnails.length; i++) {
            let thumbnail = this._thumbnailsBox._thumbnails[i];
            thumbnail.setCaptionReactiveState(false);
            thumbnail.setWindowClonesReactiveState(false);
        }
    },

    // This function handles showing the dock when dock is stationary-fixed
    // position but overlapped by gnome panel menus or meta popup windows
    fadeInDock: function(time, delay) {
        if (_DEBUG_) global.log("dockedWorkspaces: fadeInDock");
        this.actor.opacity = 255;

        // Return thumbnail windowclones to reactive state
        this._dock.reactive = true;
        this._shortcutsPanel.setReactiveState(true);
        this._thumbnailsBox.actor.reactive = true;
        for (let i = 0; i < this._thumbnailsBox._thumbnails.length; i++) {
            let thumbnail = this._thumbnailsBox._thumbnails[i];
            thumbnail.setCaptionReactiveState(true);
            thumbnail.setWindowClonesReactiveState(true);
        }

        if (!this._workAreaHeight || !this._workAreaWidth) {
            this._refreshThumbnailsOnRegionUpdate = true;
            Main.layoutManager._queueUpdateRegions();
        }
    },

    // retrieve default background color
    _getBackgroundColor: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _getBackgroundColor");
        // Remove custom style
        let oldStyle = this._thumbnailsBox.actor.get_style();
        this._thumbnailsBox.actor.set_style(null);

        // Prevent shell crash if the actor is not on the stage
        // It happens enabling/disabling repeatedly the extension
        if (!this._thumbnailsBox.actor.get_stage())
            return null;

        let themeNode = this._thumbnailsBox.actor.get_theme_node();
        this._thumbnailsBox.actor.set_style(oldStyle);

        // Just in case the theme has different border colors ..
        // We want to find the inside border-color of the dock because it is
        // the side most visible to the user. We do this by finding the side
        // opposite the position
        let side = this._position + 2;
        if (side > 3)
            side = Math.abs(side - 4);

        let backgroundColor = themeNode.get_background_color();
        let borderColor = themeNode.get_border_color(side);

        return [backgroundColor, borderColor];
    },

    _updateAppearancePreferences: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _updateAppearancePreferences");
        this._updateStraightCorners();
        this._updateBackgroundOpacity();
    },

    _updateStraightCorners: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _updateStraightCorners");
        if (this._settings.get_boolean('straight-corners')) {
            this._dock.add_style_class_name('straight-corners');
        } else {
            this._dock.remove_style_class_name('straight-corners');
        }
    },

    // update background opacity based on preferences
    _updateBackgroundOpacity: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _updateBackgroundOpacity");
        let [backgroundColor, borderColor] = this._getBackgroundColor();
        if (backgroundColor) {
            // We check the background alpha for a minimum of .001 to prevent
            // division by 0 errors when calculating borderAlpha later
            let backgroundAlpha = Math.max(Math.round(backgroundColor.alpha/2.55)/100, .001);
            let newAlpha = this._settings.get_double('background-opacity');
            this._defaultBackground = "rgba(" + backgroundColor.red + "," + backgroundColor.green + "," + backgroundColor.blue + "," + backgroundAlpha + ")";
            this._customBackground = "rgba(" + backgroundColor.red + "," + backgroundColor.green + "," + backgroundColor.blue + "," + newAlpha + ")";

            if (borderColor) {
                // The border and background alphas should remain in sync
                // We also limit the borderAlpha to a maximum of 1 (full opacity)
                let borderAlpha = Math.round(borderColor.alpha/2.55)/100;
                borderAlpha = Math.min((borderAlpha/backgroundAlpha)*newAlpha, 1);
                this._defaultBorder = "rgba(" + borderColor.red + "," + borderColor.green + "," + borderColor.blue + "," + Math.round(borderColor.alpha/2.55)/100 + ")";
                this._customBorder = "rgba(" + borderColor.red + "," + borderColor.green + "," + borderColor.blue + "," + borderAlpha + ")";
            }

            if (this._settings.get_boolean('opaque-background')) {
                this._fadeInBackground(this._settings.get_double('animation-time'), 0);
            } else {
                this._fadeOutBackground(this._settings.get_double('animation-time'), 0);
            }
        }
    },

    // handler for theme changes
    _onThemeChanged: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onThemeChanged");
        this._changeStylesheet();
        if (!this._disableRedisplay)
            this._updateAppearancePreferences();
    },

    // function to change stylesheets
    _changeStylesheet: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _changeStylesheet");
        // Get css filename
        let filename = "workspaces-to-dock.css";

        // Get new theme stylesheet
        let themeStylesheet = Main._getDefaultStylesheet();
        if (Main.getThemeStylesheet())
            themeStylesheet = Main.getThemeStylesheet();

        // Get theme directory
        let themeDirectory = themeStylesheet.get_path() ? GLib.path_get_dirname(themeStylesheet.get_path()) : "";

        // Test for workspacesToDock stylesheet
        let newStylesheet = null;
        if (themeDirectory != "")
            newStylesheet = Gio.file_new_for_path(themeDirectory + '/extensions/workspaces-to-dock/' + filename);

        if (_DEBUG_) global.log("dockedWorkspaces: _changeStylesheet - test newStylesheet");
        if (!newStylesheet || !newStylesheet.query_exists(null)) {
            if (_DEBUG_) global.log("dockedWorkspaces: _changeStylesheet - Theme doesn't support workspacesToDock .. use default stylesheet");
            let defaultStylesheet = Gio.File.new_for_path(Me.path + "/themes/default/" + filename);
            if (defaultStylesheet.query_exists(null)) {
                newStylesheet = defaultStylesheet;
            } else {
                throw new Error(_("No Workspaces-To-Dock stylesheet found") + " (extension.js).");
            }
        }

        if (Extension.workspacesToDockStylesheet && Extension.workspacesToDockStylesheet.equal(newStylesheet)) {
            if (_DEBUG_) global.log("dockedWorkspaces: _changeStylesheet - No change in stylesheet. Exit");
            return false;
        }

        // Change workspacesToDock stylesheet by updating theme
        let themeContext = St.ThemeContext.get_for_stage(global.stage);
        if (!themeContext)
            return false;

        if (_DEBUG_) global.log("dockedWorkspaces: _changeStylesheet - themeContext is valid");
        let theme = themeContext.get_theme();
        if (!theme)
            return false;

        if (_DEBUG_) global.log("dockedWorkspaces: _changeStylesheet - theme is valid");
        let customStylesheets = theme.get_custom_stylesheets();
        if (!customStylesheets)
            return false;

        let previousStylesheet = Extension.workspacesToDockStylesheet;
        Extension.workspacesToDockStylesheet = newStylesheet;

        // let newTheme = new St.Theme ({ application_stylesheet: themeStylesheet,
        //                               default_stylesheet: Main._defaultCssStylesheet });

        let newTheme = new St.Theme ({ application_stylesheet: themeStylesheet });

        for (let i = 0; i < customStylesheets.length; i++) {
            if (!customStylesheets[i].equal(previousStylesheet)) {
                newTheme.load_stylesheet(customStylesheets[i]);
            }
        }

        if (_DEBUG_) global.log("dockedWorkspaces: _changeStylesheet - Removed previous stylesheet");
        newTheme.load_stylesheet(Extension.workspacesToDockStylesheet);

        if (_DEBUG_) global.log("dockedWorkspaces: _changeStylesheet - Added new stylesheet");
        themeContext.set_theme (newTheme);

        if (!this._disableRedisplay) {
            this._refreshThumbnails();
        }

        return true;
    },

    // handler for icon changes
    _onIconsChanged: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onIconsChanged");
        if (this._disableRedisplay)
            return

        this._refreshThumbnails();
    },

    // resdiplay dock called if size-position changed due to dock resizing
    _redisplay: function() {
        if (this._disableRedisplay)
            return

        if (_DEBUG_) global.log("dockedWorkspaces: _redisplay autohide-dodge="+this._autohideStatus);
        // Initial display of dock .. sets autohideStatus
        if (this._autohideStatus == null) {
            if (this._settings.get_boolean('dock-fixed')) {
                this._autohideStatus = false;
                this.fadeInDock(this._settings.get_double('animation-time'), 0);
            } else {
                // Initial animation is out .. intellihide will animate in if its needed
                this._removeAnimations();
                this._animateOut(0, 0);
                this._autohideStatus = true;
            }
        } else {
            // Redisplay dock by animating back in .. necessary if thumbnailsBox size changed
            // even if dock is fixed
            if (this._autohideStatus) {
                if (!this._isHovering() && !(this._hoveringDash && !Main.overview._shown)) {
                    this._removeAnimations();
                    this._animateOut(0, 0, true);
                }
                this._autohideStatus = true;
            } else {
                if (!this._isHovering() && !(this._hoveringDash && !Main.overview._shown)) {
                    // had to comment out because GS3.4 fixed-dock isn't fully faded in yet when redisplay occurs again
                    //this._removeAnimations();
                    this._animateIn(this._settings.get_double('animation-time'), 0);
                }
                this._autohideStatus = false;
            }
        }

        this._updateAppearancePreferences();
        this._updateBarrier();
    },

    // update the dock size and position
    _updateSize: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _updateSize");

        // Accommodate shortcuts panel in calculations
        let shortcutsPanelThickness = 0;
        if (this._settings.get_boolean('show-shortcuts-panel')) {
            if (this._isHorizontal) {
                shortcutsPanelThickness = this._shortcutsPanel.actor.height;
            } else {
                shortcutsPanelThickness = this._shortcutsPanel.actor.width;
            }
        }

        // Get workspace area
        // This takes into account primary monitor and any additional extensions
        // that may affect width and height calculations
        let workArea = Main.layoutManager.getWorkAreaForMonitor(this._monitor.index);
        
        // get the scale factor
        let scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;

        // Get screen edge padding from preferences and multiply it by scale_factor for HiDPI monitors
        let screenEdgePadding = this._settings.get_double('screen-edge-padding') * scale_factor;

        let x, y, width, height, anchorPoint;
        if (this._isHorizontal) {
            // Get x position and width
            if (this._settings.get_boolean('customize-height')) {
                let leftMargin = Math.floor(this._settings.get_double('top-margin') * this._monitor.width);
                let rightMargin = Math.floor(this._settings.get_double('bottom-margin') * this._monitor.width);
                x = workArea.x + leftMargin;
                width = workArea.width - leftMargin - rightMargin;
            } else {
                let margin = this._monitor.width * .1;
                x = this._monitor.x + margin;
                width = this._monitor.width - (margin * 2);
            }

            // Get y position, height, and anchorpoint
            height = this._thumbnailsBox._thumbnailsBoxHeight + shortcutsPanelThickness + screenEdgePadding;
            if (this._position == St.Side.TOP) {
                y =  this._monitor.y;
                anchorPoint = Clutter.Gravity.NORTH_WEST;
            } else {
                y =  this._monitor.y + this._monitor.height;
                anchorPoint = Clutter.Gravity.SOUTH_WEST;
            }

        } else {
            // Get x position, width, and anchorpoint
            width = this._thumbnailsBox._thumbnailsBoxWidth + shortcutsPanelThickness + screenEdgePadding;
            if (this._position == St.Side.LEFT) {
                x = this._monitor.x;
                anchorPoint = Clutter.Gravity.NORTH_WEST;
            } else {
                x = this._monitor.x + this._monitor.width;
                anchorPoint = Clutter.Gravity.NORTH_EAST;
            }

            // Get y position and height
            if (this._settings.get_boolean('customize-height')) {
                let topMargin = Math.floor(this._settings.get_double('top-margin') * this._monitor.height);
                let bottomMargin = Math.floor(this._settings.get_double('bottom-margin') * this._monitor.height);
                y = workArea.y + topMargin;
                height = workArea.height - topMargin - bottomMargin;

            } else {
                let controlsTop = 45;
                y = this._monitor.y + Main.panel.actor.height + controlsTop + Main.overview._searchEntryBin.height;
                height = this._monitor.height - (y + Main.overview._searchEntryBin.height);
            }
        }

        //// skip updating if size is same ??
        //if ((this.actor.y == y) && (this.actor.width == this._thumbnailsBox._thumbnailsBoxWidth + shortcutsPanelThickness) && (this.actor.height == height)) {
            //return;
        //}

        // Update position of main actor (used to detect window overlaps)
        this.actor.set_position(x, y);
        this._struts.set_position(x, y);
        if (_DEBUG_) global.log("dockedWorkspaces: _updateSize new x = "+x+" y = "+y);

        // Update size of the main actor as well as the _dock & _panels inside
        // NOTE: Rather than rely on the builtin box layout mechanics, we control
        // both width and height based on the thumbnail & shortcuts panels. This
        // allows us to control the trigger space for showing/hiding and scrolling
        if (this._isHorizontal) {
            if (this._settings.get_boolean('customize-height')) {
                let [minThumbnailsBoxWidth, minThumbnailsBoxHeight, natThumbnailsBoxWidth, natThumbnailsBoxHeight] = this._thumbnailsBox.actor.get_preferred_size();
                let minShortcutsPanelWidth = 0, minShortcutsPanelHeight = 0, natShortcutsPanelWidth = 0, natShortcutsPanelHeight = 0;
                if (this._settings.get_boolean('show-shortcuts-panel')) {
                    [minShortcutsPanelWidth, minShortcutsPanelHeight, natShortcutsPanelWidth, natShortcutsPanelHeight] = this._shortcutsPanel.actor.get_preferred_size();
                }
                let containerWidth = natThumbnailsBoxWidth > natShortcutsPanelWidth ? natThumbnailsBoxWidth : natShortcutsPanelWidth;
                if (containerWidth > width) {
                    containerWidth = width;
                }
                this._panelsContainer.set_size(containerWidth, height);
                this._panels.set_size(containerWidth, height);
                if (this._extendContainer) {
                    this._dockContainer.set_size(width, height);
                    this._dock.set_size(width, height + this._triggerWidth);
                    this.actor.set_size(width, height + this._triggerWidth);
                } else {
                    this._dockContainer.set_size(containerWidth, height);
                    this._dock.set_size(containerWidth, height + this._triggerWidth);
                    this.actor.set_size(containerWidth, height + this._triggerWidth);
                    if (this._centerContainer) {
                        if (width > containerWidth) {
                            let xMiddle = x + Math.round((width - containerWidth) / 2);
                            this.actor.set_position(xMiddle, y);
                        }
                    }
                }
            } else {
                this._panelsContainer.set_size(width, height);
                this._panels.set_size(width, height);
                this._dockContainer.set_size(width, height);
                this._dock.set_size(width, height + this._triggerWidth);
                this.actor.set_size(width, height + this._triggerWidth);
            }
        } else {
            if (this._settings.get_boolean('customize-height')) {
                let [minThumbnailsBoxWidth, minThumbnailsBoxHeight, natThumbnailsBoxWidth, natThumbnailsBoxHeight] = this._thumbnailsBox.actor.get_preferred_size();
                let minShortcutsPanelWidth = 0, minShortcutsPanelHeight = 0, natShortcutsPanelWidth = 0, natShortcutsPanelHeight = 0;
                if (this._settings.get_boolean('show-shortcuts-panel')) {
                    [minShortcutsPanelWidth, minShortcutsPanelHeight, natShortcutsPanelWidth, natShortcutsPanelHeight] = this._shortcutsPanel.actor.get_preferred_size();
                }
                let containerHeight = natThumbnailsBoxHeight > natShortcutsPanelHeight ? natThumbnailsBoxHeight : natShortcutsPanelHeight;
                if (containerHeight > height) {
                    containerHeight = height;
                }
                this._panelsContainer.set_size(width, containerHeight);
                this._panels.set_size(width, containerHeight);
                if (this._extendContainer) {
                    this._dockContainer.set_size(width, height);
                    this._dock.set_size(width + this._triggerWidth, height);
                    this.actor.set_size(width + this._triggerWidth, height);
                } else {
                    this._dockContainer.set_size(width, containerHeight);
                    this._dock.set_size(width + this._triggerWidth, containerHeight);
                    this.actor.set_size(width + this._triggerWidth, containerHeight);
                    if (this._centerContainer) {
                        if (height > containerHeight) {
                            let yMiddle = y + Math.round((height - containerHeight) / 2);
                            this.actor.set_position(x, yMiddle);
                        }
                    }
                }
            } else {
                this._panelsContainer.set_size(width, height);
                this._panels.set_size(width, height);
                this._dockContainer.set_size(width, height);
                this._dock.set_size(width + this._triggerWidth, height);
                this.actor.set_size(width + this._triggerWidth, height);
            }
        }

        // Set anchor points
        this.actor.move_anchor_point_from_gravity(anchorPoint);
        this._struts.move_anchor_point_from_gravity(anchorPoint);

        // Update slider slideout width
        let slideoutSize = this._settings.get_boolean('dock-edge-visible') ? this._triggerWidth + DOCK_EDGE_VISIBLE_WIDTH : this._triggerWidth;
        this._slider.slideoutSize = slideoutSize;

        // Update slider partial width
        // NOTE: only effects slider width when dock is set to partially hide in overview
        let slidePartialVisibleWidth = this._triggerWidth + DOCK_EDGE_VISIBLE_OVERVIEW_WIDTH;
        if (this._settings.get_boolean('show-shortcuts-panel')
            && this._settings.get_enum('shortcuts-panel-orientation') == 1) {
                if (this._isHorizontal) {
                    slidePartialVisibleWidth = this._shortcutsPanel.actor.height;
                } else {
                    slidePartialVisibleWidth = this._shortcutsPanel.actor.width;
                }
        } else {
            // NOTE: Gnome css top panel height is 1.86em
            if (this._settings.get_boolean('customize-thumbnail-visible-width')) {
                slidePartialVisibleWidth = this._settings.get_double('thumbnail-visible-width');
            } else {
                let themeVisibleWidth = this._thumbnailsBox.actor.get_theme_node().get_length('visible-width');
                if (themeVisibleWidth > 0)
                    slidePartialVisibleWidth = themeVisibleWidth;
            }
        }
        this._slider.partialSlideoutSize = slidePartialVisibleWidth;

        // Set struts size
        if (!this._settings.get_boolean('dock-fixed')
        && (this._settings.get_boolean('intellihide') && this._settings.get_enum('intellihide-action') == IntellihideAction.SHOW_PARTIAL_FIXED)) {
            if (this._isHorizontal) {
                this._struts.set_size(width, slidePartialVisibleWidth);
            } else {
                this._struts.set_size(slidePartialVisibleWidth, height);
            }
        } else {
            this._struts.set_size(this.actor.width, this.actor.height);
        }

    },

    // 'Hard' reset dock positon: called on start and when monitor changes
    _resetPosition: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _resetPosition");
        this._monitor = this._getMonitor();

        this._updateSize();

        this._updateAppearancePreferences();
        this._updateBarrier();
    },

    _onMonitorsChanged: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onMonitorsChanged");

        // Reset the dock position and redisplay
        this._resetPosition();
        this._redisplay();
        this._refreshThumbnailsOnRegionUpdate = true;
        Main.layoutManager._queueUpdateRegions();
    },

    _refreshThumbnails: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _refreshThumbnails");
        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        this._workAreaWidth = workArea.width;
        this._workAreaHeight = workArea.height;
        if (this._thumbnailsBox) {
            this._thumbnailsBox._destroyThumbnails();
            this._thumbnailsBox._createThumbnails();
        }

        // NOTE: restarting Gnome Shell with the dock height extended leaves the top of the dock hidden
        // under the shell's top bar. Resetting the position after a thumbnail refresh (during Region Updates)
        // fixes this issue.
        this._resetPosition();
    },

    // Retrieve the preferred monitor
    _getMonitor: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _getMonitor");
        // We are using Gdk in settings prefs which sets the primary monitor to 0
        // The shell can assign a different number (Main.layoutManager.primaryMonitor)
        // This ensures that the indexing in the settings (Gdk) and in the shell are matched,
        // i.e. that we start counting from the primaryMonitorIndex
        let preferredMonitorIndex = this._settings.get_int('preferred-monitor');
        let monitorIndex = (Main.layoutManager.primaryIndex + preferredMonitorIndex) % Main.layoutManager.monitors.length ;
        let monitor = Main.layoutManager.monitors[monitorIndex];

        return monitor;
    },

    // Remove pressure barrier (GS38+ only)
    _removeBarrier: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _removeBarrier");
        if (this._barrier) {
            if (this._pressureBarrier) {
                this._pressureBarrier.removeBarrier(this._barrier);
                if (_DEBUG_) global.log("... removing barrier from pressureBarrier object");
            }
            this._barrier.destroy();
            this._barrier = null;
        }

        // Remove barrier timeout
        if (this._removeBarrierTimeoutId > 0) {
            Mainloop.source_remove(this._removeBarrierTimeoutId);
            this._removeBarrierTimeoutId = 0;
        }
        return false;
    },

    // Update pressure barrier size (GS38+ only)
    _updateBarrier: function() {
        // Remove existing barrier
        this._removeBarrier();

        // Manually reset pressure barrier
        // This is necessary because we remove the pressure barrier when it is triggered to show the dock
        if (this._pressureBarrier) {
            this._pressureBarrier._reset();
            this._pressureBarrier._isTriggered = false;
        }

        // Create new barrier
        // Note: dock in fixed possition doesn't use pressure barrier
        if (_DEBUG_) global.log("dockedWorkspaces: _updateBarrier");
        if (this.actor.visible && this._canUsePressure && this._settings.get_boolean('autohide')
                    && this._settings.get_boolean('require-pressure-to-show')
                    && !this._settings.get_boolean('dock-fixed')) {

            let x1, x2, y1, y2, direction;
            if(this._position==St.Side.LEFT){
                x1 = this._monitor.x;
                x2 = this._monitor.x;
                y1 = this.actor.y;
                y2 = this.actor.y + this.actor.height;
                direction = Meta.BarrierDirection.POSITIVE_X;
            } else if(this._position==St.Side.RIGHT) {
                x1 = this._monitor.x + this._monitor.width;
                x2 = this._monitor.x + this._monitor.width;
                y1 = this.actor.y;
                y2 = this.actor.y + this.actor.height;
                direction = Meta.BarrierDirection.NEGATIVE_X;
            } else if(this._position==St.Side.TOP) {
                let hotCornerPadding = 1;
                x1 = this.actor.x + hotCornerPadding;
                x2 = this.actor.x + hotCornerPadding + this.actor.width;
                y1 = this._monitor.y;
                y2 = this._monitor.y;
                direction = Meta.BarrierDirection.POSITIVE_Y;
            } else if (this._position==St.Side.BOTTOM) {
                x1 = this.actor.x;
                x2 = this.actor.x + this.actor.width;
                y1 = this._monitor.y + this._monitor.height;
                y2 = this._monitor.y + this._monitor.height;
                direction = Meta.BarrierDirection.NEGATIVE_Y;
            }

            if (_DEBUG_) global.log("... creating barrier");
            this._barrier = new Meta.Barrier({display: global.display,
                                x1: x1, x2: x2,
                                y1: y1, y2: y2,
                                directions: direction});

            if (this._pressureBarrier) {
                if (_DEBUG_) global.log("... adding barrier to pressureBarrier object");
                this._pressureBarrier.addBarrier(this._barrier);
            }
        }

        // Reset pressureSensed flag
        if (!this._isHovering() && this._dockState != DockState.SHOWN) {
            if (_DEBUG_) global.log("... pressureSensed flag reset");
            this._pressureSensed = false;
            this._updateTriggerWidth();
        }
    },

    // Disable autohide effect, thus show workspaces
    disableAutoHide: function(force) {
        if (_DEBUG_) global.log("dockedWorkspaces: disableAutoHide - autohideStatus = "+this._autohideStatus+" dockState = "+getDockStateDesc(this._dockState));
        // NOTE: default functionality is to not force complete animateIn
        this._autohideStatus = false;
        if (this._dockState == DockState.HIDING || this._dockState == DockState.HIDDEN) {
            this._removeAnimations();
            if (force) {
                this._animateIn(this._settings.get_double('animation-time'), 0, true);
            } else {
                this._animateIn(this._settings.get_double('animation-time'), 0);
            }
        }
    },

    // Enable autohide effect, hide workspaces
    enableAutoHide: function(dontforce) {
        if (_DEBUG_) global.log("dockedWorkspaces: enableAutoHide - autohideStatus = "+this._autohideStatus);
        // NOTE: default functionality is to force complete animateOut
        // autohide status shouldn't change if not completely animating out
        if (dontforce) {
            this._autohideStatus = false;
        } else {
            this._autohideStatus = true;
        }

        if (this._isHovering()) {
            this._dock.sync_hover();
        }

        let delay = 0; // immediately fadein background if hide is blocked by mouseover, otherwise start fadein when dock is already hidden.

        if (this._settings.get_boolean('autohide')) {
            if (_DEBUG_) global.log("dockedWorkspaces: enableAutoHide - autohide settings true");
            if (!this._isHovering() && !(this._hoveringDash && !Main.overview._shown)) {
                if (_DEBUG_) global.log("dockedWorkspaces: enableAutoHide - mouse not hovering OR dock not using autohide, so animate out");
                this._removeAnimations();
                if (dontforce) {
                    this._animateOut(this._settings.get_double('animation-time'), 0, false);
                } else {
                    if (Main.overview._shown && Main.overview.viewSelector._activePage == Main.overview.viewSelector._workspacesPage) {
                        this._animateOut(this._settings.get_double('animation-time'), 0, false);
                    } else {
                        this._animateOut(this._settings.get_double('animation-time'), 0, true);
                    }
                }
                delay = this._settings.get_double('animation-time');
            }
        } else {
            if (_DEBUG_) global.log("dockedWorkspaces: enableAutoHide - autohide off so animate out");
            this._removeAnimations();
            if (dontforce) {
                this._animateOut(this._settings.get_double('animation-time'), 0, false);
            } else {
                if (Main.overview._shown && Main.overview.viewSelector._activePage == Main.overview.viewSelector._workspacesPage) {
                    this._animateOut(this._settings.get_double('animation-time'), 0, false);
                } else {
                    this._animateOut(this._settings.get_double('animation-time'), 0, true);
                }
            }
            delay = this._settings.get_double('animation-time');
        }
    }

});
Signals.addSignalMethods(DockedWorkspaces.prototype);
