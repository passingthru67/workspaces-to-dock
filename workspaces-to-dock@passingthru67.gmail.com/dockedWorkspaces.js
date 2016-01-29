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

const OverviewOption = {
    SHOW: 0,        // Dock is always visible
    HIDE: 1,        // Dock is always invisible. Visible on mouse hover
    PARTIAL: 2      // Dock partially hidden. Visible on mouse hover
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

const ThumbnailsSlider = new Lang.Class({
    Name: 'workspacestodockThumbnailsSlider',
    Extends: Clutter.Actor,

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

        this.parent(params);

        this._child = null;

        // slide parameter: 1 = visible, 0 = hidden.
        this._slidex = localParams.initialSlideValue;
        this._side = localParams.side;
        this._slideoutSize = localParams.initialSlideoutSize; // minimum size when slid out
        this._partialSlideoutSize = initialTriggerWidth + DOCK_EDGE_VISIBLE_OVERVIEW_WIDTH;
        this._partialSlideoutAnimateTime = this._settings.get_double('animation-time');

        // Connect global signals
        this._inOverview = false;
        this._partialSlideX = 1;
        this._overviewShowingId = Main.overview.connect('showing', Lang.bind(this, this._overviewShowing));
        this._overviewHidingId = Main.overview.connect('hiding', Lang.bind(this, this._overviewHiding));

        this._overviewShownId = Main.overview.connect('shown', Lang.bind(this, this._overviewShown));
        this._overviewHiddenId = Main.overview.connect('hidden', Lang.bind(this, this._overviewHidden));
    },

    destroy: function() {
        if (this._overviewShowingId)
            Main.overview.disconnect(this._overviewShowingId);

        if (this._overviewHidingId)
            Main.overview.disconnect(this._overviewHidingId);

        if (this._overviewShownId)
            Main.overview.disconnect(this._overviewShownId);

        if (this._overviewHiddenId)
            Main.overview.disconnect(this._overviewHiddenId);
    },

    _overviewShowing: function() {
        this._showingOverview = true;
        this._inOverview = true;
        this._partialSlideX = 0;
    },

    _overviewShown: function() {
        this._showingOverview = false;
        this._partialSlideX = 1;
    },

    _overviewHiding: function() {
        this._hidingOverview = true;
        this._partialSlideX = 1;
    },

    _overviewHidden: function() {
        this._hidingOverview = false;
        this._inOverview = false;
        this._partialSlideX = 0;
    },

    vfunc_allocate: function(box, flags) {
        this.set_allocation(box, flags);

        if (this._child == null)
            return;

        let availWidth = box.x2 - box.x1;
        let availHeight = box.y2 - box.y1;
        let [minChildWidth, minChildHeight, natChildWidth, natChildHeight] =
            this._child.get_preferred_size();

        let childWidth = natChildWidth;
        let childHeight = natChildHeight;

        let childBox = new Clutter.ActorBox();

        if (this._inOverview && this._showingOverview) {
            this._partialSlideX = Math.min(this._partialSlideX + this._partialSlideoutAnimateTime, 1);
        } else if (this._inOverview && this._hidingOverview) {
            this._partialSlideX = Math.max(this._partialSlideX - this._partialSlideoutAnimateTime, 0);
        }

        let slideoutSize;
        let overviewAction = this._settings.get_enum('overview-action');
        if (this._inOverview
            && Main.overview.viewSelector._activePage == Main.overview.viewSelector._workspacesPage
            && overviewAction == OverviewOption.PARTIAL) {
                slideoutSize = this._partialSlideoutSize * this._partialSlideX;
        } else {
            slideoutSize = this._slideoutSize;
        }

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
    vfunc_get_preferred_width: function(forHeight) {
        let slideoutSize;
        let overviewAction = this._settings.get_enum('overview-action');
        if (this._inOverview
            && Main.overview.viewSelector._activePage == Main.overview.viewSelector._workspacesPage
            && overviewAction == OverviewOption.PARTIAL) {
                slideoutSize = this._partialSlideoutSize * this._partialSlideX;
        } else {
            slideoutSize = this._slideoutSize;
        }

        let [minWidth, natWidth ] = this._child.get_preferred_width(forHeight);
        if (this._side ==  St.Side.LEFT
          || this._side == St.Side.RIGHT) {
            minWidth = (minWidth - slideoutSize)*this._slidex + slideoutSize;
            natWidth = (natWidth - slideoutSize)*this._slidex + slideoutSize;
        }
        return [minWidth, natWidth];
    },

    // Just the child height but taking into account the slided out part
    vfunc_get_preferred_height: function(forWidth) {
        let slideoutSize;
        let overviewAction = this._settings.get_enum('overview-action');
        if (this._inOverview
            && Main.overview.viewSelector._activePage == Main.overview.viewSelector._workspacesPage
            && overviewAction == OverviewOption.PARTIAL) {
                slideoutSize = this._partialSlideoutSize * this._partialSlideX;
        } else {
            slideoutSize = this._slideoutSize;
        }

        let [minHeight, natHeight] = this._child.get_preferred_height(forWidth);
        if (this._side ==  St.Side.TOP
          || this._side ==  St.Side.BOTTOM) {
            minHeight = (minHeight - slideoutSize)*this._slidex + slideoutSize;
            natHeight = (natHeight - slideoutSize)*this._slidex + slideoutSize;
        }
        return [minHeight, natHeight];
    },

    // I was expecting it to be a virtual function... stil I don't understand
    // how things work.
    add_child: function(actor) {

        // I'm supposed to have only one child
        if(this._child !== null) {
            this.remove_child(actor);
        }

        this._child = actor;
        this.parent(actor);
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

    set partialSlideoutSize(value) {
        this._partialSlideoutSize = value;
    },

    get partialSlideoutSize() {
        return this._partialSlideoutSize;
    }
});

const DockedWorkspaces = new Lang.Class({
    Name: 'workspacestodockDockedWorkspaces',

    _init: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: init * * * * *");
        this._gsCurrentVersion = Config.PACKAGE_VERSION.split('.');
        this._settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        this._signalHandler = new Convenience.globalSignalHandler();

        // temporarily disable redisplay until initialized (prevents connected signals from trying to update dock visibility)
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

        // initialize animation status object
        this._animStatus = new AnimationStatus(true);

        // initialize popup menu flag
        this._popupMenuShowing = false;

        // initialize colors with generic values
        this._defaultBackground = {red:0, green:0, blue:0};
        this._customBackground = {red:0, green:0, blue:0};
        this._cssStylesheet = null;

        // Initialize pressure barrier variables
        this._canUsePressure = false;
        this._pressureSensed = false;
        this._pressureBarrier = null;
        this._barrier = null;
        this._messageTrayShowing = false;
        this._removeBarrierTimeoutId = 0;

        // Override Gnome Shell functions
        this._overrideGnomeShellFunctions();

        // Create a new thumbnailsbox object
        this._thumbnailsBox = new MyWorkspaceThumbnail.myThumbnailsBox(this);

        // Create a shortcuts panel object
        this._shortcutsPanel = new ShortcutsPanel.ShortcutsPanel(this);
        this._shortcutsPanel.connect("update-favorite-apps", Lang.bind(this, this._onShortcutsPanelUpdated));
        this._shortcutsPanel.connect("update-running-apps", Lang.bind(this, this._onShortcutsPanelUpdated));

        // Create custom workspace switcher popup
        this._workspaceSwitcher = null;
        if (this._isHorizontal)
            this._workspaceSwitcher = new MyWorkspaceSwitcherPopup.WorkspaceSwitcher();

        // Create the main dock container, turn on track hover, add hoverChange signal
        let positionStyleClass = ['top', 'right', 'bottom', 'left'];
        let styleClass = positionStyleClass[this._position];
        if (this._settings.get_boolean('dock-fixed'))
            styleClass += " fixed";

        let shortcutsPanelOrientation = this._settings.get_enum('shortcuts-panel-orientation');
        if (this._settings.get_boolean('show-shortcuts-panel')) {
            if (shortcutsPanelOrientation == 1) {
                styleClass += " inside";
            }
        }

        if (this._settings.get_boolean('customize-height') && this._settings.get_int('customize-height-option') == 1) {
            if (this._settings.get_double('top-margin') == 0 || this._settings.get_double('bottom-margin') == 0) {
                styleClass += " fullheight";
            }
        }

        let packVertical = false;
        if (this._isHorizontal)
            packVertical = true;

        this._dock = new St.BoxLayout({
            name: 'workspacestodockDock',
            reactive: true,
            track_hover: true,
            vertical: packVertical,
            style_class: styleClass
        });
        this._dock.connect("notify::hover", Lang.bind(this, this._hoverChanged));
        this._dock.connect("scroll-event", Lang.bind(this, this._onScrollEvent));
        this._dock.connect("button-release-event", Lang.bind(this, this._onDockClicked));

        // Create centering containers
        this._container = new St.BoxLayout({
            name: 'workspacestodockContainer',
            reactive: false,
            vertical: packVertical
        });
        this._containerWrapper = new St.BoxLayout({
            name: 'workspacestodockContainerWrapper',
            reactive: false,
            vertical: !packVertical
        });
        this._containerWrapper.add(this._container,{x_fill: false, y_fill: false, x_align: St.Align.MIDDLE, y_align: St.Align.MIDDLE, expand: true});

        // Create the dock wrapper
        let align;
        if (this._isHorizontal) {
            if (this._position == St.Side.TOP) {
                align = St.Align.START;
            } else {
                align = St.Align.END;
            }
        } else {
            if (this._position == St.Side.LEFT) {
                align = St.Align.START;
            } else {
                align = St.Align.END;
            }
        }

        this.actor = new St.Bin({ name: 'workspacestodockDockWrapper',reactive: false,
            x_align: align,
            y_align: align
        });
        this.actor._delegate = this;
        this._realizeId = this.actor.connect("realize", Lang.bind(this, this._initialize));

        // Put dock on the primary monitor
        this._monitor = Main.layoutManager.primaryMonitor;

        // Connect global signals
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
                global.screen,
                'in-fullscreen-changed',
                Lang.bind(this, this._updateBarrier)
            ],
            [
                global.screen,
                'workspace-added',
                Lang.bind(this, this._onWorkspaceAdded)
            ],
            [
                global.screen,
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
                if (DashToDock && DashToDock.dock) {
                    var keys = DashToDock.dock._settings.list_keys();
                    if (keys.indexOf('dock-position') > -1) {
                        DashToDockExtension.hasDockPositionKey = true;
                    }
                    // Connect DashToDock hover signal
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
        }

        // Create trigger spacer
        this._triggerSpacer = new St.Label({
                            name: 'workspacestodockTriggerSpacer',
                            text: ''
                        });

        this._triggerWidth = 1;
        this._updateTriggerWidth();

        // This is the sliding actor whose allocation is to be tracked for input regions
        let slideoutSize = this._triggerWidth;
        if (this._settings.get_boolean('dock-edge-visible')) {
            slideoutSize = this._triggerWidth + DOCK_EDGE_VISIBLE_WIDTH;
        }
        this._slider = new ThumbnailsSlider({side: this._position, initialSlideoutSize: slideoutSize});

        // Add spacer, workspaces, and shortcuts panel to dock container based on dock position
        // and shortcuts panel orientation
        if (this._position == St.Side.RIGHT || this._position == St.Side.BOTTOM) {
            this._container.add_actor(this._triggerSpacer);
        }
        if (this._isHorizontal) {
            if ((this._position == St.Side.TOP && shortcutsPanelOrientation == 0) ||
                (this._position == St.Side.BOTTOM && shortcutsPanelOrientation == 1)) {
                this._container.add_actor(this._shortcutsPanel.actor);
                this._container.add_actor(this._thumbnailsBox.actor);
            } else {
                this._container.add_actor(this._thumbnailsBox.actor);
                this._container.add_actor(this._shortcutsPanel.actor);
            }
        } else {
            if ((this._position == St.Side.LEFT && shortcutsPanelOrientation == 0) ||
                (this._position == St.Side.RIGHT && shortcutsPanelOrientation == 1)) {
                this._container.add_actor(this._shortcutsPanel.actor);
                this._container.add_actor(this._thumbnailsBox.actor);
            } else {
                this._container.add_actor(this._thumbnailsBox.actor);
                this._container.add_actor(this._shortcutsPanel.actor);
            }
        }
        if (this._position == St.Side.LEFT || this._position == St.Side.TOP) {
            this._container.add_actor(this._triggerSpacer);
        }

        // Add dock to slider and main container actor and then to the Chrome.
        this._dock.add_actor(this._containerWrapper);
        this._slider.add_child(this._dock);
        this.actor.set_child(this._slider);

        //Hide the dock whilst setting positions
        //this.actor.hide(); but I need to access its width, so I use opacity
        this.actor.set_opacity(0);

        // Since the actor is not a topLevel child and its parent is now not added to the Chrome,
        // the allocation change of the parent container (slide in and slideout) doesn't trigger
        // anymore an update of the input regions. Force the update manually.
        this.actor.connect('notify::allocation',
                                              Lang.bind(Main.layoutManager, Main.layoutManager._queueUpdateRegions));

        // Add aligning container without tracking it for input region (old affectsinputRegion: false that was removed).
        // The public method trackChrome requires the actor to be child of a tracked actor. Since I don't want the parent
        // to be tracked I use the private internal _trackActor instead.
        Main.uiGroup.add_child(this.actor);
        Main.layoutManager._trackActor(this._slider, {trackFullscreen: true});

        // Keep the dash below the modalDialogGroup
        Main.layoutManager.uiGroup.set_child_below_sibling(this.actor, Main.layoutManager.modalDialogGroup);

        if (this._settings.get_boolean('dock-fixed')) {
            Main.layoutManager._trackActor(this.actor, {affectsStruts: true});
            // Force region update to update workspace area
            Main.layoutManager._queueUpdateRegions();
        }

        // pretend this._slider is isToplevel child so that fullscreen is actually tracked
        let index = Main.layoutManager._findActor(this._slider);
        Main.layoutManager._trackedActors[index].isToplevel = true ;
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
        this._updateBackgroundOpacity();

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
            if (self._settings.get_boolean('shortcuts-panel-appsbutton-animation')) {
                return self._shortcutsPanel._appsButton.actor;
            } else {
                return this._dash.showAppsButton;
            }
        };

        // Hide normal workspaces thumbnailsBox
        Main.overview._controls._thumbnailsSlider.actor.opacity = 0;

        // Set MAX_THUMBNAIL_SCALE to custom value
        GSFunctions['WorkspaceThumbnail_MAX_THUMBNAIL_SCALE'] = WorkspaceThumbnail.MAX_THUMBNAIL_SCALE;
        if (this._settings.get_boolean('customize-thumbnail')) {
            WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = this._settings.get_double('thumbnail-size');
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
            if (_DEBUG_) global.log("dockedWorkspaces: UPDATEREGIONS - workArea W= "+workArea.width + "  H= "+workArea.height+ "  CURRENT W="+self._workAreaWidth+"  H="+self._workAreaHeight+"  FORCED?="+self._refreshThumbnailsOnRegionUpdate);
            if (self._refreshThumbnailsOnRegionUpdate) {
                self._refreshThumbnailsOnRegionUpdate = false;
                self._refreshThumbnails();
            } else {
                if (self._workAreaWidth) {
                    let tolerance = workArea.width * .01;
                    if (self._workAreaWidth < workArea.width-tolerance || self._workAreaWidth > workArea.width+tolerance) {
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
            for (let i = 0; i < monitors.length; i++) {
                let geometry = { x: monitors[i].x, y: monitors[i].y, width: monitors[i].width, height: monitors[i].height };

                // Adjust width for dash
                let dashWidth = 0;
                let dashHeight = 0;
                let dashMonitorIndex;
                if (DashToDock && DashToDock.dock) {
                    dashMonitorIndex = DashToDock.dock._settings.get_int('preferred-monitor');
                    if (dashMonitorIndex < 0 || dashMonitorIndex >= Main.layoutManager.monitors.length) {
                        dashMonitorIndex = this._primaryIndex;
                    }
                    if (i == dashMonitorIndex) {
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
                } else {
                    if (!self._settings.get_boolean('hide-dash') &&
                        i == this._primaryIndex) {
                        dashWidth = Main.overview._controls._dashSlider.getVisibleWidth() + spacing;
                    }
                }

                // Adjust width for workspaces thumbnails
                let thumbnailsWidth = 0;
                let thumbnailsHeight = 0;
                let thumbnailsMonitorIndex = self._settings.get_int('preferred-monitor');
                if (thumbnailsMonitorIndex < 0 || thumbnailsMonitorIndex >= Main.layoutManager.monitors.length) {
                    thumbnailsMonitorIndex = this._primaryIndex;
                }
                if (i == thumbnailsMonitorIndex) {
                    let overviewAction = self._settings.get_enum('overview-action');
                    let visibleEdge = self._triggerWidth;
                    if (self._settings.get_boolean('dock-edge-visible')) {
                        visibleEdge = self._triggerWidth + DOCK_EDGE_VISIBLE_WIDTH;
                    }
                    if (self._position == St.Side.LEFT ||
                        self._position == St.Side.RIGHT) {
                            if (overviewAction == OverviewOption.HIDE) {
                                thumbnailsWidth = visibleEdge;
                            } else if (overviewAction == OverviewOption.PARTIAL) {
                                thumbnailsWidth = self._slider.partialSlideoutSize;
                            } else {
                                thumbnailsWidth = self.actor.get_width() + spacing;
                            }
                    }
                    if (self._position == St.Side.TOP ||
                        self._position == St.Side.BOTTOM) {
                            if (overviewAction == OverviewOption.HIDE) {
                                thumbnailsHeight = visibleEdge;
                            } else if (overviewAction == OverviewOption.PARTIAL) {
                                thumbnailsHeight = self._slider.partialSlideoutSize;
                            } else {
                                thumbnailsHeight = self.actor.get_height() + spacing;
                            }
                    }
                }

                // Adjust x and width for workspacesView geometry
                let controlsWidth = dashWidth + thumbnailsWidth;
                if (DashToDock && DashToDock.dock && DashToDockExtension.hasDockPositionKey) {
                    // What if dash and thumbnailsbox are both on the same side?
                    if (DashToDock.dock._position == St.Side.LEFT &&
                        self._position == St.Side.LEFT) {
                            controlsWidth = Math.max(dashWidth, thumbnailsWidth);
                            geometry.x += controlsWidth;
                    } else {
                        if (DashToDock.dock._position == St.Side.LEFT) {
                            geometry.x += dashWidth;
                        }
                        if (self._position == St.Side.LEFT) {
                            geometry.x += thumbnailsWidth;
                        }
                    }
                    if (DashToDock.dock._position == St.Side.RIGHT &&
                        self._position == St.Side.RIGHT) {
                            controlsWidth = Math.max(dashWidth, thumbnailsWidth);
                    }
                } else {
                    if (this.actor.get_text_direction() == Clutter.TextDirection.LTR) {
                        if (self._position == St.Side.LEFT) {
                            controlsWidth = Math.max(dashWidth, thumbnailsWidth);
                            geometry.x += controlsWidth;
                        } else {
                            geometry.x += dashWidth;
                        }
                    } else {
                        if (self._position == St.Side.RIGHT) {
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
                if (DashToDock && DashToDock.dock && DashToDockExtension.hasDockPositionKey) {
                    if (DashToDock.dock._position == St.Side.TOP &&
                        self._position == St.Side.TOP) {
                            controlsHeight = Math.max(dashHeight, thumbnailsHeight);
                            geometry.y += controlsHeight;
                    } else {
                        if (DashToDock.dock._position == St.Side.TOP) {
                            geometry.y += dashHeight;
                        }
                        if (self._position == St.Side.TOP) {
                            geometry.y += thumbnailsHeight;
                        }
                    }
                    if (DashToDock.dock._position == St.Side.BOTTOM &&
                        self._position == St.Side.BOTTOM) {
                            controlsHeight = Math.max(dashHeight, thumbnailsHeight);
                    }
                } else {
                    if (self._position == St.Side.TOP) {
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

        // Restore MAX_THUMBNAIL_SCALE to default value
        WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = GSFunctions['WorkspaceThumbnail_MAX_THUMBNAIL_SCALE'];

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

    _updateTriggerWidth: function() {
        // Calculate and set triggerWidth
        if (!this._settings.get_boolean('dock-fixed')
            && !this._settings.get_boolean('dock-edge-visible')
            && this._settings.get_boolean('require-pressure-to-show')
            && this._settings.get_boolean('disable-scroll')) {
                if (this._pressureSensed) {
                    this._triggerWidth = 1;
                } else if (this._animStatus.shown()) {
                    this._triggerWidth = 1;
                } else {
                    this._triggerWidth = 0;
                }
        } else {
            this._triggerWidth = 1;
        }

        // Set triggerSpacer
        if (this._isHorizontal) {
            this._triggerSpacer.height = this._triggerWidth;
            if (this._settings.get_boolean('dock-fixed'))
                this._triggerSpacer.height = 0;
        } else {
            this._triggerSpacer.width = this._triggerWidth;
            if (this._settings.get_boolean('dock-fixed'))
                this._triggerSpacer.width = 0;
        }

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

        this._settings.connect('changed::opaque-background-always', Lang.bind(this, function() {
            this._updateBackgroundOpacity();
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
                if (!DashToDock || !DashToDock.dock) {
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
            this._updateTriggerWidth();
            this._redisplay();
        }));

        this._settings.connect('changed::require-pressure-to-show', Lang.bind(this, function() {
            this._updateTriggerWidth();
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
            this._updateTriggerWidth();
            this._redisplay();
        }));

        this._settings.connect('changed::customize-thumbnail', Lang.bind(this, function() {
            // Set Gnome Shell's workspace thumbnail size so that overview mode layout doesn't overlap dock
            if (this._settings.get_boolean('customize-thumbnail')) {
                WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = this._settings.get_double('thumbnail-size');
            } else {
                WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = GSFunctions['WorkspaceThumbnail_MAX_THUMBNAIL_SCALE'];
            }
            // hide and show thumbnailsBox to resize thumbnails
            this._refreshThumbnails();
        }));

        this._settings.connect('changed::thumbnail-size', Lang.bind(this, function() {
            // Set Gnome Shell's workspace thumbnail size so that overview mode layout doesn't overlap dock
            if (this._settings.get_boolean('customize-thumbnail')) {
                WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = this._settings.get_double('thumbnail-size');
            } else {
                WorkspaceThumbnail.MAX_THUMBNAIL_SCALE = GSFunctions['WorkspaceThumbnail_MAX_THUMBNAIL_SCALE'];
            }
            // hide and show thumbnailsBox to resize thumbnails
            this._refreshThumbnails();
        }));

        this._settings.connect('changed::workspace-captions', Lang.bind(this, function() {
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

        this._settings.connect('changed::customize-height', Lang.bind(this, function() {
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
        this._settings.connect('changed::customize-height-option', Lang.bind(this, function() {
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
                if (this._autohideStatus && (this._animStatus.hidden() || this._animStatus.hiding())) {
                    this._show();
                } else {
                    this._hide();
                }
            })
        );
    },

    _unbindDockKeyboardShortcut: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _unbindDockKeyboardShortcut");
        Main.wm.removeKeybinding('dock-keyboard-shortcut');
    },

    // handler for mouse hover events
    _hoverChanged: function() {
        if(_DEBUG_) global.log("dockedWorkspaces: _hoverChanged - dock.hover = "+this._dock.hover+" autohideStatus = "+this._autohideStatus);
        if (this._canUsePressure && this._settings.get_boolean('require-pressure-to-show') && this._barrier) {
            if (this._pressureSensed == false) {
                if(_DEBUG_) global.log("dockedWorkspaces: _hoverChanged - presureSensed = "+this._pressureSensed+" RETURN");
                return;
            }
        }

        if (this._settings.get_boolean('require-click-to-show')) {
            // check if metaWin is maximized
            let activeWorkspace = global.screen.get_active_workspace();
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
                if (this._dock.hover) {
                    this._hovering = true;
                    return;
                } else {
                    this._hovering = false;
                }
            } else {
                this._hovering = false;
            }
        }

        //Skip if dock is not in autohide mode for instance because it is shown by intellihide
        if(_DEBUG_) global.log("dockedWorkspaces: _hoverChanged - show or hide?");
        if (this._settings.get_boolean('autohide') && this._autohideStatus) {
            if (this._dock.hover) {
                if(_DEBUG_) global.log("dockedWorkspaces: _hoverChanged - show");
                this._show();
            } else {
                if(_DEBUG_) global.log("dockedWorkspaces: _hoverChanged - hide");
                this._hide();
            }
        }
    },

    // handler for mouse click events - works in conjuction with hover event to show dock for maxmized windows
    _onDockClicked: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onDockClicked");
        if (this._settings.get_boolean('require-click-to-show')) {
            if (this._hovering) {
                //Skip if dock is not in autohide mode for instance because it is shown by intellihide
                if (this._settings.get_boolean('autohide') && this._autohideStatus) {
                    if (this._dock.hover) {
                        this._show();
                    } else {
                        this._hide();
                    }
                }
                this._hovering = false;
            }
        }
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
        if (this._settings.get_boolean('dashtodock-hover') && DashToDock && DashToDock.dock) {
            if (Main.overview.visible == false) {
                if (DashToDock.dock._box.hover) {
                    this._hoveringDash = true;
                    this._show();
                }
            }
        }
    },

    _onDashToDockHiding: function() {
        if (_DEBUG_) global.log("Dash HIDING");
        //Skip if dock is not in dashtodock hover mode
        if (this._settings.get_boolean('dashtodock-hover') && DashToDock && DashToDock.dock) {
            this._hoveringDash = false;
            this._hide();
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
        if (this._settings.get_boolean('dashtodock-hover') && DashToDock && DashToDock.dock) {
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
    },

    // handler for extensionSystem state changes
    _onExtensionSystemStateChanged: function(source, extension) {
        // Only looking for DashToDock state changes
        if (extension.uuid == DashToDock_UUID) {
            if (_DEBUG_) global.log("dockedWorkspaces: _onExtensionSystemStateChanged for "+extension.uuid+" state= "+extension.state);
            DashToDockExtension = extension;
            if (DashToDockExtension.state == ExtensionSystem.ExtensionState.ENABLED) {
                DashToDock = DashToDockExtension.imports.extension;
                if (DashToDock && DashToDock.dock) {
                    var keys = DashToDock.dock._settings.list_keys();
                    if (keys.indexOf('dock-position') > -1) {
                        DashToDockExtension.hasDockPositionKey = true;
                    }
                    // Connect DashToDock hover signal
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
        if (_DEBUG_) global.log("dockedWorkspaces: _onScrollEvent autohideStatus = "+this._autohideStatus+" animHidden = "+this._animStatus.hidden()+" animHiding = "+this._animStatus.hiding());
        if (this._settings.get_boolean('disable-scroll') && this._autohideStatus && (this._animStatus.hidden() || this._animStatus.hiding()))
            return Clutter.EVENT_STOP;

        let activeWs = global.screen.get_active_workspace();
        let direction;
        switch (event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP:
            if (this._isHorizontal) {
                direction = Meta.MotionDirection.LEFT;
            } else {
                direction = Meta.MotionDirection.UP;
            }
            break;
        case Clutter.ScrollDirection.DOWN:
            if (this._isHorizontal) {
                direction = Meta.MotionDirection.RIGHT;
            } else {
                direction = Meta.MotionDirection.DOWN;
            }
            break;
        }

        if (direction) {
            let ws = activeWs.get_neighbor(direction);

            if (Main.wm._workspaceSwitcherPopup == null) {
                if (this._isHorizontal) {
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
        let anim = this._animStatus;
        if (_DEBUG_) global.log("dockedWorkspaces: _show autohideStatus = "+this._autohideStatus+" anim.hidden = "+anim.hidden()+" anim.hiding = "+anim.hiding());

        if (this._autohideStatus && (anim.hidden() || anim.hiding())) {
            let delay;
            // If the dock is hidden, wait this._settings.get_double('show-delay') before showing it;
            // otherwise show it immediately.
            if (anim.hidden()) {
                delay = this._settings.get_double('show-delay');
            } else if (anim.hiding()) {
                // suppress all potential queued hiding animations (always give priority to show)
                this._removeAnimations();
                delay = 0;
            }

            this._animateIn(this._settings.get_double('animation-time'), delay);
        }
    },

    // autohide function to hide dock
    _hide: function() {
        let anim = this._animStatus;
        if (_DEBUG_) global.log("dockedWorkspaces: _hide autohideStatus = "+this._autohideStatus+" anim.shown = "+anim.shown()+" anim.showing = "+anim.showing());

        // If no hiding animation is running or queued
        if (!this._hoveringDash && this._autohideStatus && (anim.showing() || anim.shown())) {
            let delay;

            // If a show is queued but still not started (i.e the mouse was
            // over the screen  border but then went away, i.e not a sufficient
            // amount of time is passeed to trigger the dock showing) remove it.
            if (anim.showing()) {
                if (anim.running) {
                    // If a show already started, let it finish; queue hide without removing the show.
                    // to obtain this I increase the delay to avoid the overlap and interference
                    // between the animations
                    delay = this._settings.get_double('hide-delay') + 2 * this._settings.get_double('animation-time') + this._settings.get_double('show-delay');
                } else {
                    this._removeAnimations();
                    delay = 0;
                }
            } else if (anim.shown()) {
                delay = this._settings.get_double('hide-delay');
            }

            this._animateOut(this._settings.get_double('animation-time'), delay);
        }
    },

    setPopupMenuFlag: function(showing) {
        this._popupMenuShowing = showing;
        if (!showing) {
            if (this.actor.hover == true) {
                this.actor.sync_hover();
            } else {
                this._hide();
            }
        }
    },

    // autohide function to animate the show dock process
    _animateIn: function(time, delay) {
        this._animStatus.queue(true);
        Tweener.addTween(this._slider, {
            slidex: 1,
            time: time,
            delay: delay,
            transition: 'easeOutQuad',
            onStart: Lang.bind(this, function() {
                if (_DEBUG_) global.log("dockedWorkspaces: _animateIN onStart");
                this._animStatus.start();
            }),
            onOverwrite: Lang.bind(this, function() {
                this._animStatus.clear();
                if (_DEBUG_) global.log("dockedWorkspaces: _animateIN onOverwrite");
            }),
            onComplete: Lang.bind(this, function() {
                this._animStatus.end();

                // Remove barrier so that mouse pointer is released and can access monitors on other side of dock
                // NOTE: Delay needed to keep mouse from moving past dock and re-hiding dock immediately. This
                // gives users an opportunity to hover over the dock
                if (this._removeBarrierTimeoutId > 0) {
                    Mainloop.source_remove(this._removeBarrierTimeoutId);
                    this._removeBarrierTimeoutId = 0;
                }
                this._removeBarrierTimeoutId = Mainloop.timeout_add(100, Lang.bind(this, this._removeBarrier));
                this._updateTriggerWidth();
                if (_DEBUG_) global.log("dockedWorkspaces: _animateIN onComplete");
            })
        });
    },

    // autohide function to animate the hide dock process
    _animateOut: function(time, delay) {
        if (this._popupMenuShowing)
            return;

        this._animStatus.queue(false);
        Tweener.addTween(this._slider, {
            slidex: 0,
            time: time,
            delay: delay,
            transition: 'easeOutQuad',
            onStart: Lang.bind(this, function() {
                if (_DEBUG_) global.log("dockedWorkspaces: _animateOUT onStart");
                this._animStatus.start();
            }),
            onOverwrite: Lang.bind(this, function() {
                this._animStatus.clear();
                if (_DEBUG_) global.log("dockedWorkspaces: _animateOUT onOverwrite");
            }),
            onComplete: Lang.bind(this, function() {
                this._animStatus.end();
                this._updateBarrier();
                if (_DEBUG_) global.log("dockedWorkspaces: _animateOUT onComplete");
            })
        });
    },

    // autohide function to remove show-hide animations
    _removeAnimations: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _removeAnimations");
        Tweener.removeTweens(this._slider);
        this._animStatus.clearAll();
    },

    // autohide function to fade out opaque background
    _fadeOutBackground: function(time, delay) {
        if (_DEBUG_) global.log("dockedWorkspaces: _fadeOutBackground");
        // CSS time is in ms
        this._thumbnailsBox.actor.set_style('transition-duration:' + time*1000 + ';' +
            'transition-delay:' + delay*1000 + ';' +
            'background-color:' + this._defaultBackground);

        this._shortcutsPanel.actor.set_style('transition-duration:' + time*1000 + ';' +
            'transition-delay:' + delay*1000 + ';' +
            'background-color:' + this._defaultBackground);
    },

    // autohide function to fade in opaque background
    _fadeInBackground: function(time, delay) {
        if (_DEBUG_) global.log("dockedWorkspaces: _fadeInBackground");
        // CSS time is in ms
        this._thumbnailsBox.actor.set_style('transition-duration:' + time*1000 + ';' +
            'transition-delay:' + delay*1000 + ';' +
            'background-color:' + this._customBackground);

        this._shortcutsPanel.actor.set_style('transition-duration:' + time*1000 + ';' +
            'transition-delay:' + delay*1000 + ';' +
            'background-color:' + this._customBackground);
    },

    // This function handles hiding the dock when dock is in stationary-fixed
    // position but overlapped by gnome panel menus or meta popup windows
    fadeOutDock: function(time, delay, metaOverlap) {
        if (_DEBUG_) global.log("dockedWorkspaces: fadeOutDock");
        if (Main.layoutManager._inOverview) {
            // Hide fixed dock when in overviewmode applications view
            this.actor.opacity = 0;
        }

        // Make thumbnail windowclones non-reactive
        // NOTE: Need this for when in overviewmode applications view and dock is in fixed mode.
        // Fixed dock has opacity set to 0 but is still reactive.
        this.actor.reactive = false;
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
        this.actor.reactive = true;
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

        let backgroundColor = themeNode.get_background_color();
        return backgroundColor;
    },

    // update background opacity based on preferences
    _updateBackgroundOpacity: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _updateBackgroundOpacity");
        let backgroundColor = this._getBackgroundColor();

        if (backgroundColor) {
            let newAlpha = this._settings.get_double('background-opacity');
            this._defaultBackground = "rgba(" + backgroundColor.red + "," + backgroundColor.green + "," + backgroundColor.blue + "," + Math.round(backgroundColor.alpha/2.55)/100 + ")";
            this._customBackground = "rgba(" + backgroundColor.red + "," + backgroundColor.green + "," + backgroundColor.blue + "," + newAlpha + ")";

            if (this._settings.get_boolean('opaque-background') && (this._autohideStatus || this._settings.get_boolean('opaque-background-always'))) {
                this._fadeInBackground(this._settings.get_double('animation-time'), 0);
            } else if (!this._settings.get_boolean('opaque-background') || (!this._autohideStatus && !this._settings.get_boolean('opaque-background-always'))) {
                this._fadeOutBackground(this._settings.get_double('animation-time'), 0);
            }
        }
    },

    // handler for theme changes
    _onThemeChanged: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onThemeChanged");
        this._changeStylesheet();
        if (!this._disableRedisplay)
            this._updateBackgroundOpacity();
    },

    // function to change stylesheets
    _changeStylesheet: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _changeStylesheet");
        // Get css filename
        let filename = "workspaces-to-dock.css";

        // Get new theme stylesheet
        let themeStylesheet = Main._defaultCssStylesheet;
        if (Main._cssStylesheet != null)
            themeStylesheet = Main._cssStylesheet;

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

        if (_DEBUG_) global.log("dockedWorkspaces: _redisplay");

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
            if (this._autohideStatus == false) {
                // had to comment out because GS3.4 fixed-dock isn't fully faded in yet when redisplay occurs again
                //this._removeAnimations();
                this._animateIn(this._settings.get_double('animation-time'), 0);
                this._autohideStatus = false;
            }
        }

        this._updateBackgroundOpacity();
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
            height = this._thumbnailsBox._thumbnailsBoxHeight + shortcutsPanelThickness;
            if (this._position == St.Side.TOP) {
                y =  this._monitor.y;
                anchorPoint = Clutter.Gravity.NORTH_WEST;
            } else {
                y =  this._monitor.y + this._monitor.height;
                anchorPoint = Clutter.Gravity.SOUTH_WEST;
            }

        } else {
            // Get x position, width, and anchorpoint
            width = this._thumbnailsBox._thumbnailsBoxWidth + shortcutsPanelThickness;
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

        //// skip updating if size is same
        //if ((this.actor.y == y) && (this.actor.width == this._thumbnailsBox._thumbnailsBoxWidth + shortcutsPanelThickness) && (this.actor.height == height)) {
            //return;
        //}

        // Update position of wrapper actor (used to detect window overlaps)
        this.actor.set_position(x, y);
        if (_DEBUG_) global.log("dockedWorkspaces: _updateSize new x = "+x+" y = "+y);

        // Update size of wrapper actor and _dock inside the slider
        if (this._isHorizontal) {
            this.actor.set_size(width, height + this._triggerSpacer.height); // This is the whole dock wrapper
            this._dock.set_size(width, height + this._triggerSpacer.height); // This is the actual dock inside the slider that we check for mouse hover
            if (this._settings.get_boolean('customize-height') && this._settings.get_int('customize-height-option') == 0) {
                this._containerWrapper.set_size(width, height + this._triggerSpacer.height);
                let [minThumbnailsBoxWidth, minThumbnailsBoxHeight, natThumbnailsBoxWidth, natThumbnailsBoxHeight] = this._thumbnailsBox.actor.get_preferred_size();
                let minShortcutsPanelWidth, minShortcutsPanelHeight, natShortcutsPanelWidth, natShortcutsPanelHeight = 0;
                if (this._settings.get_boolean('show-shortcuts-panel')) {
                    [minShortcutsPanelWidth, minShortcutsPanelHeight, natShortcutsPanelWidth, natShortcutsPanelHeight] = this._shortcutsPanel.actor.get_preferred_size();
                }
                let containerWidth = natThumbnailsBoxWidth > natShortcutsPanelWidth ? natThumbnailsBoxWidth : natShortcutsPanelWidth;
                if (containerWidth > width) {
                    containerWidth = width;
                }
                this._container.set_size(containerWidth, height + this._triggerSpacer.height);
            } else {
                this._containerWrapper.set_size(width, height + this._triggerSpacer.height);
                this._container.set_size(width, height + this._triggerSpacer.height);
            }
        } else {
            this.actor.set_size(width + this._triggerSpacer.width, height); // This is the whole dock wrapper
            this._dock.set_size(width + this._triggerSpacer.width, height); // This is the actual dock inside the slider that we check for mouse hover
            if (this._settings.get_boolean('customize-height') && this._settings.get_int('customize-height-option') == 0) {
                this._containerWrapper.set_size(width + this._triggerSpacer.width, height);
                let [minThumbnailsBoxWidth, minThumbnailsBoxHeight, natThumbnailsBoxWidth, natThumbnailsBoxHeight] = this._thumbnailsBox.actor.get_preferred_size();
                let minShortcutsPanelWidth, minShortcutsPanelHeight, natShortcutsPanelWidth, natShortcutsPanelHeight = 0;
                if (this._settings.get_boolean('show-shortcuts-panel')) {
                    [minShortcutsPanelWidth, minShortcutsPanelHeight, natShortcutsPanelWidth, natShortcutsPanelHeight] = this._shortcutsPanel.actor.get_preferred_size();
                }
                let containerHeight = natThumbnailsBoxHeight > natShortcutsPanelHeight ? natThumbnailsBoxHeight : natShortcutsPanelHeight;
                if (containerHeight > height) {
                    containerHeight = height;
                }
                this._container.set_size(width + this._triggerSpacer.width, containerHeight);
            } else {
                this._containerWrapper.set_size(width + this._triggerSpacer.width, height);
                this._container.set_size(width + this._triggerSpacer.width, height);
            }
        }

        // Set anchor points
        this.actor.move_anchor_point_from_gravity(anchorPoint);

        // Update slider slideout width
        let slideoutSize = this._triggerWidth;
        if (this._settings.get_boolean('dock-edge-visible')) {
            slideoutSize = this._triggerWidth + DOCK_EDGE_VISIBLE_WIDTH;
        }
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
            let themeVisibleWidth = this._thumbnailsBox.actor.get_theme_node().get_length('visible-width');
            if (themeVisibleWidth > 0)
                slidePartialVisibleWidth = themeVisibleWidth;
        }
        this._slider.partialSlideoutSize = slidePartialVisibleWidth;
    },

    // 'Hard' reset dock positon: called on start and when monitor changes
    _resetPosition: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _resetPosition");
        this._monitor = this._getMonitor();

        this._updateSize();

        this._updateBackgroundOpacity();
        this._updateBarrier();
    },

    _onMonitorsChanged: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onMonitorsChanged");
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
        let monitorIndex = this._settings.get_int('preferred-monitor');
        let monitor;

        if (monitorIndex > 0 && monitorIndex < Main.layoutManager.monitors.length) {
            monitor = Main.layoutManager.monitors[monitorIndex];
        } else {
            monitor = Main.layoutManager.primaryMonitor;
        }

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
                    && this._autohideStatus && this._settings.get_boolean('require-pressure-to-show')
                    && !this._settings.get_boolean('dock-fixed') && !this._messageTrayShowing) {

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
                x1 = this.actor.x;
                x2 = this.actor.x + this.actor.width;
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
        if (!this._dock.hover && !this._animStatus.shown()) {
            this._pressureSensed = false;
            this._updateTriggerWidth();
        }
    },

    // Disable autohide effect, thus show workspaces
    disableAutoHide: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: disableAutoHide - autohideStatus = "+this._autohideStatus);
        if (this._autohideStatus == true) {
            this._autohideStatus = false;

            this._removeAnimations();
            this._animateIn(this._settings.get_double('animation-time'), 0);

            if (this._settings.get_boolean('opaque-background') && !this._settings.get_boolean('opaque-background-always'))
                this._fadeOutBackground(this._settings.get_double('animation-time'), 0);

        }
    },

    // Enable autohide effect, hide workspaces
    enableAutoHide: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: enableAutoHide - autohideStatus = "+this._autohideStatus);

        this._autohideStatus = true;

        let delay = 0; // immediately fadein background if hide is blocked by mouseover, otherwise start fadein when dock is already hidden.
        this._removeAnimations();

        if (this._dock.hover == true) {
            this._dock.sync_hover();
        }

        if (!((this._hoveringDash && !Main.overview.visible) || this._dock.hover) || !this._settings.get_boolean('autohide')) {
            if (_DEBUG_) global.log("dockedWorkspaces: enableAutoHide - mouse not hovering OR dock not using autohide, so animate out");
            this._animateOut(this._settings.get_double('animation-time'), 0);
            delay = this._settings.get_double('animation-time');
        } else {
            if (_DEBUG_) global.log("dockedWorkspaces: enableAutoHide - mouse hovering AND dock using autohide, so startWorkspacesShowLoop instead of animate out");
            delay = 0;
        }

        if (this._settings.get_boolean('opaque-background') && !this._settings.get_boolean('opaque-background-always')) {
            this._fadeInBackground(this._settings.get_double('animation-time'), delay);
        }
    }

});
Signals.addSignalMethods(DockedWorkspaces.prototype);

/*
 * Store animation status in a perhaps overcomplicated way.
 * status is true for visible, false for hidden
 */
const AnimationStatus = new Lang.Class({
    Name: 'workspacestodockAnimationStatus',

    _init: function(initialStatus) {
        this.status = initialStatus;
        this.nextStatus = [];
        this.queued = false;
        this.running = false;
    },

    queue: function(nextStatus) {
        this.nextStatus.push(nextStatus);
        this.queued = true;
    },

    start: function() {
        if (this.nextStatus.length == 1) {
            this.queued = false;
        }
        this.running = true;
    },

    end: function() {
        if (this.nextStatus.length == 1) {
            this.queued = false; // in the case end is called and start was not
        }
        this.running = false;
        this.status = this.nextStatus.shift();
    },

    clear: function() {
        if (this.nextStatus.length == 1) {
            this.queued = false;
            this.running = false;
        }

        this.nextStatus.splice(0, 1);
    },

    clearAll: function() {
        this.queued = false;
        this.running = false;
        this.nextStatus.splice(0, this.nextStatus.length);
    },

    // Return true if a showing animation is running or queued
    showing: function() {
        if ((this.running == true || this.queued == true) && this.nextStatus[0] == true)
            return true;
        else
            return false;
    },

    shown: function() {
        if (this.status == true && !(this.queued || this.running))
            return true;
        else
            return false;
    },

    // Return true if an hiding animation is running or queued
    hiding: function() {
        if ((this.running == true || this.queued == true) && this.nextStatus[0] == false)
            return true;
        else
            return false;
    },

    hidden: function() {
        if (this.status == false && !(this.queued || this.running))
            return true;
        else
            return false;
    }
});
