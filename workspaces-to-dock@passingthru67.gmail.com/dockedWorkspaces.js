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

const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;


const Main = imports.ui.main;
const WorkspacesView = imports.ui.workspacesView;
const Workspace = imports.ui.workspace;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;
const ViewSelector = imports.ui.viewSelector;
const Overview = imports.ui.overview;
const Tweener = imports.ui.tweener;
const WorkspaceSwitcherPopup = imports.ui.workspaceSwitcherPopup;
let OverviewControls = null;

const ExtensionSystem = imports.ui.extensionSystem;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const MyThumbnailsBox = Me.imports.myThumbnailsBox;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const DashToDock_UUID = "dash-to-dock@micxgx.gmail.com";
let DashToDock = null;

const DOCK_HIDDEN_WIDTH = 2;
const DOCK_EDGE_VISIBLE_WIDTH = 5;

function dockedWorkspaces(settings, gsCurrentVersion) {
    this._gsCurrentVersion = gsCurrentVersion;
    
    // Define gnome shell 3.8 OverviewControls
    if (this._gsCurrentVersion[1] > 6)
        OverviewControls = imports.ui.overviewControls;

    this._init(settings);
}

dockedWorkspaces.prototype = {

    _init: function(settings) {
        // temporarily disable redisplay until initialized (prevents connected signals from trying to update dock visibility)
        this._disableRedisplay = true;
        if (_DEBUG_) global.log("dockedWorkspaces: init - disableRediplay");
        
        // Load settings
        this._settings = settings;
        this._bindSettingsChanges();

        this._signalHandler = new Convenience.globalSignalHandler();

        // Timeout id used to ensure the workspaces is hidden after some menu is shown
        this._workspacesShowTimeout = 0;

        // Authohide current status. Not to be confused with autohide enable/disagle global (g)settings
        // Initially set to null - will be set during first enable/disable autohide
        this._autohideStatus = null;
        
        // initialize animation status object
        this._animStatus = new animationStatus(true);

        // initialize colors with generic values
        this._defaultBackground = {red:0, green:0, blue:0};
        this._customBackground = {red:0, green:0, blue:0};
        this._cssStylesheet = null;

		// Override Gnome Shell functions
		this._overrideGnomeShellFunctions();

        // Create a new thumbnailsbox object
        this._thumbnailsBox = new MyThumbnailsBox.myThumbnailsBox(this, this._gsCurrentVersion, this._settings);
		
        // Create the main container, turn on track hover, add hoverChange signal
        this.actor = new St.BoxLayout({
            name: 'workspacestodockContainer',
            reactive: true,
            track_hover: true
        });
        this.actor.connect("notify::hover", Lang.bind(this, this._hoverChanged));
        this.actor.connect("scroll-event", Lang.bind(this, this._onScrollEvent));
        this.actor.connect("button-release-event", Lang.bind(this, this._onDockClicked));
        this._realizeId = this.actor.connect("realize", Lang.bind(this, this._initialize));

        // Sometimes Main.wm._workspaceSwitcherPopup is null when first loading the 
        // extension causing scroll-event problems
        if (Main.wm._workspaceSwitcherPopup == null) {
            Main.wm._workspaceSwitcherPopup = new WorkspaceSwitcherPopup.WorkspaceSwitcherPopup();
            // additional fix for gnome shell 3.6 workspaceSwitcherPopup
            // popup is destroy and not just hidden in 3.6
            if (this._gsCurrentVersion[1] > 4) {
                Main.wm._workspaceSwitcherPopup.connect('destroy', function() {
                    Main.wm._workspaceSwitcherPopup = null;
                });
            }
        }

        // Create the staticbox that stores the size and position where the dock is shown for determining window overlaps
        // note: used by intellihide module to check window overlap
        this.staticBox = new Clutter.ActorBox({
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 0
        });

        // Put dock on the primary monitor
        this._monitor = Main.layoutManager.primaryMonitor;

        // Connect global signals
        this._signalHandler.push(
            [
                Main.overview._viewSelector,
                'notify::y',
                Lang.bind(this, this._updateYPosition)
            ],
            [
                this._thumbnailsBox.actor,
                'notify::width',
                Lang.bind(this, this._thumbnailsBoxResized)
            ],
            [
                global.screen,
                'monitors-changed',
                Lang.bind(this, this._resetPosition)
            ],
            [
                St.ThemeContext.get_for_stage(global.stage),
                'changed',
                Lang.bind(this, this._onThemeChanged)
            ],
            [
                ExtensionSystem._signals,
                'extension-state-changed',
                Lang.bind(this, this._onExtensionSystemStateChanged)
            ],
            [
                global.screen,
                'workspace-added',
                Lang.bind(this, this._workspacesAdded)
            ],
            [
                global.screen,
                'workspace-removed',
                Lang.bind(this, this._workspacesRemoved)
            ]
        );

		// Connect GS34 & GS36 global signals
		if (this._gsCurrentVersion[1] < 7) {
		    this._signalHandler.push(
		        [
		            Main.overview._viewSelector._pageArea,
		            'notify::y',
		            Lang.bind(this, this._updateYPosition)
		        ],
		        [
		            global.screen,
		            'restacked',
		            Lang.bind(this, this._workspacesRestacked)
		        ],
		        [
		            global.screen,
		            'workspace-switched',
		            Lang.bind(this, this._workspacesRestacked)
		        ]
			);
		}
        if (_DEBUG_) global.log("dockedWorkspaces: init - signals being captured");

        // Connect DashToDock hover signal if the extension is already loaded and enabled
        let extension = ExtensionUtils.extensions[DashToDock_UUID];
        if (extension) {
            if (extension.state == ExtensionSystem.ExtensionState.ENABLED) {
                if (_DEBUG_) global.log("dockeWorkspaces.js: DashToDock extension is installed and enabled");
                DashToDock = extension.imports.extension;
                if (DashToDock && DashToDock.dock) {
                    // Connect DashToDock hover signal
                    this._signalHandler.pushWithLabel(
                        'DashToDockHoverSignal',
                        [
                            DashToDock.dock._box,
                            'notify::hover',
                            Lang.bind(this, this._onDashToDockHoverChanged)
                        ]
                    );
                }
            }
        }
        
        //Hide the dock whilst setting positions
        //this.actor.hide(); but I need to access its width, so I use opacity
        this.actor.set_opacity(0);

        // Add workspaces and to the main container actor and then to the Chrome.
        this.actor.add_actor(this._thumbnailsBox.actor);

        Main.layoutManager.addChrome(this.actor, {
            affectsStruts: this._settings.get_boolean('dock-fixed'),
            affectsInputRegion: true
        });

        // TODO: can we lower this.actor in gnome shell without causing problems?
        // gs3.4 problem - dock immediately hides when workspace is switched even when mouse is hovering
        // Lower the dock below the trayBox so that messageTray popups can receive focus & clicks
        if (this._gsCurrentVersion[1] > 4)
            this.actor.lower(Main.layoutManager.trayBox);
		
    },

    _initialize: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: initializing");
        if(this._realizeId > 0){
            this.actor.disconnect(this._realizeId);
            this._realizeId = 0;
        }

        // GS3.4 workaround to get correct size and position of actor inside the overview
        if (this._gsCurrentVersion[1] == 4) {
            Main.overview._group.show();
            Main.overview._group.hide();
        }
        
        // Show the thumbnailsBox.  We need it to calculate the width of the dock.
        if (this._gsCurrentVersion[1] < 7) {
            this._thumbnailsBox.show();
        } else {
            this._thumbnailsBox._createThumbnails();
        }
        
        // Set initial position
        this._resetPosition();

		if (!this._settings.get_boolean('dock-fixed')) {
            // Show the non-fixed dock (off screen from resetPosition)
            // note: fixed dock already on screen and will animate opacity to 255 when fadeInDock is called
            this.actor.set_opacity(255);
		}

        this._disableRedisplay = false;
        if (_DEBUG_) global.log("dockedWorkspaces: initialize - turn on redisplay");
        
        // Now that the dock is on the stage and custom themes are loaded
        // retrieve background color and set background opacity and load workspace caption css
        this._updateBackgroundOpacity();
        this._onThemeSupportChanged();

        // Not really required because thumbnailsBox width signal will trigger a redisplay
        // Also found GS3.6 crashes returning from lock screen (Ubuntu GS Remix)
        //this._redisplay();
    },

    destroy: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: destroying");
        if (this._gsCurrentVersion[1] > 6) {
            // Destroy thumbnailsBox & global signals
            this._thumbnailsBox._destroyThumbnails();
        }
        
        // Disconnect global signals
        this._signalHandler.disconnect();

        // Clear loop used to ensure workspaces visibility update.
        if (this._workspacesShowTimeout > 0)
            Mainloop.source_remove(this._workspacesShowTimeout);

        // Destroy main clutter actor: this should be sufficient
        // From clutter documentation:
        // If the actor is inside a container, the actor will be removed.
        // When you destroy a container, its children will be destroyed as well. 
        this.actor.destroy();

        // Restore normal Gnome Shell functions
        this._restoreGnomeShellFunctions();
    },

    // function called during init to override gnome shell 3.4/3.6/#
    _overrideGnomeShellFunctions: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _overrideGnomeShellFunctions");
        // Override the WorkspaceClone onButtonRelease function to allow right click events to bubble up
        // Copied from Gnome Shell .. right click detection added .. returns false to bubble
        let self = this;
        let p = WorkspaceThumbnail.WindowClone.prototype;
        this.saved_WindowClone_onButtonRelease = p._onButtonRelease;
        p._onButtonRelease = function (actor, event) {
            if (self._settings.get_boolean('toggle-overview')) {
                let button = event.get_button();
                if (button == 3) { //right click
                    return false;
                }
            }
            this.emit('selected', event.get_time());
            return true;
        };

        // Force normal workspaces to be always zoomed
        if (this._gsCurrentVersion[1] < 7) {
            // Override the WorkspacesDisplay updateAlwaysZoom function
            let p = WorkspacesView.WorkspacesDisplay.prototype;
            this.saved_updateAlwaysZoom = p._updateAlwaysZoom;
            p._updateAlwaysZoom = function() {
                this._alwaysZoomOut = true;
            };

            // Set zoom status to true & hide normal workspaces thumbnailsBox
            if (this._gsCurrentVersion[1] == 4) {
                Main.overview._workspacesDisplay._alwaysZoomOut = true;
                Main.overview._workspacesDisplay._thumbnailsBox.actor.hide();
            }
            if (this._gsCurrentVersion[1] == 6) {
                Main.overview._viewSelector._workspacesDisplay._alwaysZoomOut = true;
                Main.overview._viewSelector._workspacesDisplay._thumbnailsBox.actor.opacity = 0;
            }
        } else {
            // GS38 moved things to the overviewControls thumbnailsSlider
            let p = OverviewControls.ThumbnailsSlider.prototype;
            this.saved_getAlwaysZoomOut = p._getAlwaysZoomOut;
            p._getAlwaysZoomOut = function() {
                let alwaysZoomOut = true;
                return alwaysZoomOut;
            };
            // Hide normal workspaces thumbnailsBox
            Main.overview._controls._thumbnailsSlider.actor.opacity = 0;
        }

    },
    
    // function called during destroy to restore gnome shell 3.4/3.6/#
    _restoreGnomeShellFunctions: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _restoreGnomeShellFunctions");
        // Restore normal WindowClone onButtonRelease function
        let p = WorkspaceThumbnail.WindowClone.prototype;
        p._onButtonRelease = this.saved_WindowClone_onButtonRelease;

        if (this._gsCurrentVersion[1] < 7) {
            // Restore normal workspaces to previous zoom setting
            let p = WorkspacesView.WorkspacesDisplay.prototype;
            p._updateAlwaysZoom = this.saved_updateAlwaysZoom;

            // Restore zoom status to false & normal workspaces thumbnailsBox to show
            if (this._gsCurrentVersion[1] == 4) {
                Main.overview._workspacesDisplay._alwaysZoomOut = false;
                Main.overview._workspacesDisplay._updateAlwaysZoom();
                Main.overview._workspacesDisplay._thumbnailsBox.actor.show();
            }
            if (this._gsCurrentVersion[1] == 6) {
                Main.overview._viewSelector._workspacesDisplay._alwaysZoomOut = false;
                Main.overview._viewSelector._workspacesDisplay._updateAlwaysZoom();
                Main.overview._viewSelector._workspacesDisplay._thumbnailsBox.actor.opacity = 255;
            }
        } else {
            let p = OverviewControls.ThumbnailsSlider.prototype;
            p._getAlwaysZoomOut = this.saved_getAlwaysZoomOut;
            Main.overview._controls._thumbnailsSlider.actor.opacity = 255;
        }

    },

    // handler for when workspace is restacked
    _workspacesRestacked: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _workspacesRestacked");
        let stack = global.get_window_actors();
        let stackIndices = {};
        for (let i = 0; i < stack.length; i++) {
            // Use the stable sequence for an integer to use as a hash key
            stackIndices[stack[i].get_meta_window().get_stable_sequence()] = i;
        }
        this._thumbnailsBox.syncStacking(stackIndices);
    },

    // handler for when workspace is added
    _workspacesAdded: function() {
        let NumMyWorkspaces = this._thumbnailsBox._thumbnails.length;
        let NumGlobalWorkspaces = global.screen.n_workspaces;
        let active = global.screen.get_active_workspace_index();
        
        // NumMyWorkspaces == NumGlobalWorkspaces shouldn't happen, but does when Firefox started.
        // Assume that a workspace thumbnail is still in process of being removed from _thumbnailsBox
        if (_DEBUG_) global.log("dockedWorkspaces: _workspacesAdded - thumbnail being added  .. ws="+NumGlobalWorkspaces+" th="+NumMyWorkspaces);
        if (NumMyWorkspaces == NumGlobalWorkspaces)
            NumMyWorkspaces --;

        if (NumGlobalWorkspaces > NumMyWorkspaces)
            this._thumbnailsBox.addThumbnails(NumMyWorkspaces, NumGlobalWorkspaces - NumMyWorkspaces);
    },

    // handler for when workspace is removed
    _workspacesRemoved: function() {
        let NumMyWorkspaces = this._thumbnailsBox._thumbnails.length;
        let NumGlobalWorkspaces = global.screen.n_workspaces;
        let active = global.screen.get_active_workspace_index();
        
        // TODO: Not sure if this is an issue?
        if (_DEBUG_) global.log("dockedWorkspaces: _workspacesRemoved - thumbnails being removed .. ws="+NumGlobalWorkspaces+" th="+NumMyWorkspaces);
        if (NumMyWorkspaces == NumGlobalWorkspaces)
            return;

        let removedIndex;
        //let removedNum = NumMyWorkspaces - NumGlobalWorkspaces;
        let removedNum = 1;
        for (let w = 0; w < NumMyWorkspaces; w++) {
            let metaWorkspace = global.screen.get_workspace_by_index(w);
            if (this._thumbnailsBox._thumbnails[w].metaWorkspace != metaWorkspace) {
                removedIndex = w;
                break;
            }
        }
        
        if (removedIndex != null) {
            if (_DEBUG_) global.log("dockedWorkspaces: _workspacesRemoved - thumbnail index being removed is = "+removedIndex);
            if (this._gsCurrentVersion[1] < 6) {
                this._thumbnailsBox.removeThumbmails(removedIndex, removedNum);
            } else {
                this._thumbnailsBox.removeThumbnails(removedIndex, removedNum);
            }
        }
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

        this._settings.connect('changed::dock-fixed', Lang.bind(this, function() {
            if (_DEBUG_) global.log("dockedWorkspaces: _bindSettingsChanges for dock-fixed");
            Main.layoutManager.removeChrome(this.actor);
			Main.layoutManager.addChrome(this.actor, {
				affectsStruts: this._settings.get_boolean('dock-fixed'),
				affectsInputRegion: true
			});
            
            // TODO: can we lower this.actor in gnome shell without causing problems?
            // gs3.4 problem - dock immediately hides when workspace is switched even when mouse is hovering
            // Lower the dock below the trayBox so that messageTray popups can receive focus & clicks
            if (this._gsCurrentVersion[1] > 4)
                this.actor.lower(Main.layoutManager.trayBox);

            if (this._settings.get_boolean('dock-fixed')) {
                // show dock immediately when setting changes
                this._autohideStatus = true; // It could be false but the dock could be hidden
                this.disableAutoHide();
            } else {
                this.emit('box-changed');
            }
        }));

        this._settings.connect('changed::autohide', Lang.bind(this, function() {
            this.emit('box-changed');
        }));
        
        this._settings.connect('changed::preferred-monitor', Lang.bind(this, this._resetPosition));
        
        this._settings.connect('changed::dock-edge-visible', Lang.bind(this, function() {
            if (this._autohideStatus) {
                this._animateIn(this._settings.get_double('animation-time'), 0);
                this._animateOut(this._settings.get_double('animation-time'), 0);
            }
        }));
        
        this._settings.connect('changed::workspace-captions', Lang.bind(this, function() {
            if (this._gsCurrentVersion[1] < 7) {
                this._thumbnailsBox.hide();
                this._thumbnailsBox.show();
            } else {
                this._thumbnailsBox._destroyThumbnails();
                this._thumbnailsBox._createThumbnails();
            }
        }));
        this._settings.connect('changed::workspace-caption-items', Lang.bind(this, function() {
            if (this._gsCurrentVersion[1] < 7) {
                this._thumbnailsBox.hide();
                this._thumbnailsBox.show();
            } else {
                this._thumbnailsBox._destroyThumbnails();
                this._thumbnailsBox._createThumbnails();
            }
        }));
        this._settings.connect('changed::workspace-caption-windowcount-image', Lang.bind(this, function() {
            if (this._gsCurrentVersion[1] < 7) {
                this._thumbnailsBox.hide();
                this._thumbnailsBox.show();
            } else {
                this._thumbnailsBox._destroyThumbnails();
                this._thumbnailsBox._createThumbnails();
            }
        }));

        this._settings.connect('changed::workspace-caption-large-icons', Lang.bind(this, function() {
            if (this._gsCurrentVersion[1] < 7) {
                this._thumbnailsBox.hide();
                this._thumbnailsBox.show();
            } else {
                this._thumbnailsBox._destroyThumbnails();
                this._thumbnailsBox._createThumbnails();
            }
        }));

        this._settings.connect('changed::workspace-captions-support', Lang.bind(this, function() {
            this._onThemeSupportChanged();
        }));
        
        this._settings.connect('changed::extend-height', Lang.bind(this, this._updateSize));
        this._settings.connect('changed::top-margin', Lang.bind(this, this._updateSize));
        this._settings.connect('changed::bottom-margin', Lang.bind(this, this._updateSize));
    },

    // handler for mouse hover events
    _hoverChanged: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _hoverChanged");
        if (this._settings.get_boolean('require-click-to-show')) {
            // check if metaWin is maximized
            let currentWorkspace = global.screen.get_active_workspace_index();
            let maximized = false;
            let windows = global.get_window_actors();
            for (let i = windows.length-1; i >= 0; i--) {
                let metaWin = windows[i].get_meta_window();
                if(_DEBUG_) global.log("window being checked = "+metaWin.get_wm_class());
                let metaWorkspace = metaWin.get_workspace().index();
                if (_DEBUG_) global.log("window workspace = "+metaWorkspace+" currentWorkspace = "+currentWorkspace);
                if (metaWorkspace != null && metaWorkspace == currentWorkspace) {
                    if (_DEBUG_) global.log("window located in current workspace");
                    if (metaWin.appears_focused && metaWin.maximized_horizontally) {
                        maximized = true;
                        if (_DEBUG_) global.log("window is focused and maximized");
                        break;
                    }
                }
            }
            // set hovering flag if maximized
            if (maximized) {
                if (this.actor.hover) {
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
        if (this._settings.get_boolean('autohide') && this._autohideStatus) {
            if (this.actor.hover) {
                this._show();
            } else {
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
                    if (this.actor.hover) {
                        this._show();
                    } else {
                        this._hide();
                    }
                }
                this._hovering = false;
            }
        }
    },

    // handler for DashToDock hover events
    _onDashToDockHoverChanged: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onDashToDockHoverChanged");
        //Skip if dock is not in dashtodock hover mode
        if (this._settings.get_boolean('dashtodock-hover') && DashToDock && DashToDock.dock) {
            if (DashToDock.dock._box.hover) {
                if (Main.overview.visible == false) {
                    this._show();
                }
            } else {
                this._hide();
            }
        }
    },

    // handler for extensionSystem state changes
    _onExtensionSystemStateChanged: function(source, extension) {
        // Only looking for DashToDock state changes
        if (extension.uuid == DashToDock_UUID) {
            if (_DEBUG_) global.log("dockedWorkspaces: _onExtensionSystemStateChanged for "+extension.uuid+" state= "+extension.state);
            if (extension.state == ExtensionSystem.ExtensionState.ENABLED) {
                DashToDock = extension.imports.extension;
                if (DashToDock && DashToDock.dock) {
                    // Connect DashToDock hover signal
                    this._signalHandler.pushWithLabel(
                        'DashToDockHoverSignal',
                        [
                            DashToDock.dock._box,
                            'notify::hover',
                            Lang.bind(this, this._onDashToDockHoverChanged)
                        ]
                    );
                }
            } else if (extension.state == ExtensionSystem.ExtensionState.DISABLED || extension.state == ExtensionSystem.ExtensionState.UNINSTALLED) {
                DashToDock = null;
                this._signalHandler.disconnectWithLabel('DashToDockHoverSignal');
            }
        }
    },

    // handler for mouse scroll events
    // Switches workspace by scrolling over the dock
    // This comes from desktop-scroller@obsidien.github.com
    _onScrollEvent: function (actor, event) {
        if (event.get_scroll_direction() == Clutter.ScrollDirection.UP) {
            if (this._gsCurrentVersion[1] < 6) {
                Main.wm.actionMoveWorkspaceUp();
            } else {
                Main.wm.actionMoveWorkspace(Meta.MotionDirection.UP);
            }
        } else if (event.get_scroll_direction() == Clutter.ScrollDirection.DOWN) {
            if (this._gsCurrentVersion[1] < 6) {
                Main.wm.actionMoveWorkspaceDown();
            } else {
                Main.wm.actionMoveWorkspace(Meta.MotionDirection.DOWN);
            }
        }
        return true;
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

            // Ensure workspaces is hidden after closing icon menu if necessary
            this._startWorkspacesShowLoop();
        }
    },

    // autohide function to start a delay loop when showing the workspaces.
    _startWorkspacesShowLoop: function() {
		if (_DEBUG_) global.log("dockedWorkspaces: _startWorkspacesShowLoop");
        // If a loop already exists clear it
        if (this._workspacesShowTimeout > 0)
            Mainloop.source_remove(this._workspacesShowTimeout);

        this._workspacesShowTimeout = Mainloop.timeout_add(500, Lang.bind(this, function() {
            if (_DEBUG_) global.log("dockedWorkspaces: delay looping");
            // I'm not sure why but I need not to sync hover if it results already false
            if (this.actor.hover == true) {
                this.actor.sync_hover();
            }
            return true; // to make the loop continue;
        }));
    },

    // autohide function to hide dock
    _hide: function() {
        let anim = this._animStatus;
        if (_DEBUG_) global.log("dockedWorkspaces: _hide autohideStatus = "+this._autohideStatus+" anim.shown = "+anim.shown()+" anim.showing = "+anim.showing());

        // If no hiding animation is running or queued
        if (this._autohideStatus && (anim.showing() || anim.shown())) {
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

            // Clear workspacesShow Loop
            if (this._workspacesShowTimeout > 0)
                Mainloop.source_remove(this._workspacesShowTimeout);
        }
    },

    // autohide function to animate the show dock process
    _animateIn: function(time, delay) {
        let final_position = this._monitor.x + this._monitor.width - this._thumbnailsBox.actor.width - 1;
		if (_DEBUG_) global.log("dockedWorkspaces: _animateIN - currrent_position = "+ this.actor.x+" final_position = "+final_position);
        if (_DEBUG_) global.log("dockedWorkspaces: _animateIN - _thumbnailsBox width = "+this._thumbnailsBox.actor.width);
        if (_DEBUG_) global.log("dockedWorkspaces: _animateIN - actor width = "+this.actor.width);

        if (final_position !== this.actor.x) {
            this._unsetHiddenWidth();
            this._animStatus.queue(true);
            Tweener.addTween(this.actor, {
                x: final_position,
                time: time,
                delay: delay,
                transition: 'easeOutQuad',
                onUpdate: Lang.bind(this, this._updateClip),
                onStart: Lang.bind(this, function() {
                    this._animStatus.start();
                    if (_DEBUG_) global.log("dockedWorkspaces: _animateIn onStart");
                }),
                onOverwrite: Lang.bind(this, function() {
                    this._animStatus.clear();
                    if (_DEBUG_) global.log("dockedWorkspaces: _animateIn onOverwrite");
                }),
                onComplete: Lang.bind(this, function() {
                    this._animStatus.end();
					if (_DEBUG_) global.log("dockedWorkspaces: _animateIn onComplete");
                })
            });
        } else {
			// Still need to trigger animStatus states so that show/hide dock functions work properly
			if (_DEBUG_) global.log("dockedWorkspaces: _animateIn final_position == actor.x .. trigger animStatus");
            this._animStatus.queue(true);
			this._animStatus.end();
		}
    },

    // autohide function to animate the hide dock process
    _animateOut: function(time, delay) {
        let final_position;
        if (this._settings.get_boolean('dock-edge-visible')) {
            final_position = this._monitor.x + this._monitor.width - 1 - DOCK_EDGE_VISIBLE_WIDTH;
        } else {
            final_position = this._monitor.x + this._monitor.width - 1;
        }

        if (_DEBUG_) global.log("dockedWorkspaces: _animateOUT currrent_position = "+ this.actor.x+" final_position = "+final_position);
        if (_DEBUG_) global.log("dockedWorkspaces: _animateOUT - _thumbnailsBox width = "+this._thumbnailsBox.actor.width);
        if (_DEBUG_) global.log("dockedWorkspaces: _animateOUT - actor width = "+this.actor.width);
        
        if (final_position !== this.actor.x) {
            this._animStatus.queue(false);
            Tweener.addTween(this.actor, {
                x: final_position,
                time: time,
                delay: delay,
                transition: 'easeOutQuad',
                onUpdate: Lang.bind(this, this._updateClip),
                onStart: Lang.bind(this, function() {
                    this._animStatus.start();
                    if (_DEBUG_) global.log("dockedWorkspaces: _animateOut onStart");
                }),
                onOverwrite: Lang.bind(this, function() {
                    this._animStatus.clear();
                    if (_DEBUG_) global.log("dockedWorkspaces: _animateOut onOverwrite");
                }),
                onComplete: Lang.bind(this, function() {
                    this._animStatus.end();
                    this._setHiddenWidth();
                    if (_DEBUG_) global.log("dockedWorkspaces: _animateOut onComplete");
                })
            });
        } else {
			// Still need to trigger animStatus states so that show/hide dock functions work properly
			if (_DEBUG_) global.log("dockedWorkspaces: _animateOut final_position == actor.x .. trigger animStatus");
            this._animStatus.queue(false);
			this._animStatus.end();
            this._setHiddenWidth();
		}
    },

    // autohide function to remove show-hide animations
    _removeAnimations: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _removeAnimations");
        Tweener.removeTweens(this.actor);
        this._animStatus.clearAll();
    },

    // autohide function to fade out opaque background
    _fadeOutBackground: function(time, delay) {
        if (_DEBUG_) global.log("dockedWorkspaces: _fadeOutBackground");
        // CSS time is in ms
        this._thumbnailsBox._background.set_style('transition-duration:' + time*1000 + ';' + 
            'transition-delay:' + delay*1000 + ';' + 
            'background-color:' + this._defaultBackground);
    },

    // autohide function to fade in opaque background
    _fadeInBackground: function(time, delay) {
        if (_DEBUG_) global.log("dockedWorkspaces: _fadeInBackground");
        // CSS time is in ms
        this._thumbnailsBox._background.set_style('transition-duration:' + time*1000 + ';' + 
            'transition-delay:' + delay*1000 + ';' + 
            'background-color:' + this._customBackground);
    },

    // This function handles hiding the dock when dock is in stationary-fixed
    // position but overlapped by gnome panel menus or meta popup windows
    fadeOutDock: function(time, delay, nonreactive) {
        if (_DEBUG_) global.log("dockedWorkspaces: fadeOutDock");
        if (this._autohideStatus == false) {
            this._autohideStatus = true;

            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                opacity: 0,
                time: time,
                delay: delay,
                transition: 'easeOutQuad',
                onComplete: Lang.bind(this, function() {
                    //this.actor.lower_bottom(); // send dock to back of stage allowing messageTray menus to react to clicks
                    if (nonreactive == true)
                        global.set_stage_input_mode(Shell.StageInputMode.NONREACTIVE); // clutter stage needs to be nonreactive else meta popup windows (under stage) don't receive hover and click events
                })
            });
        }
    },

    // This function handles showing the dock when dock is stationary-fixed
    // position but overlapped by gnome panel menus or meta popup windows
    fadeInDock: function(time, delay) {
        if (_DEBUG_) global.log("dockedWorkspaces: fadeInDock");
        if (this._autohideStatus == true) {
            this._autohideStatus = false;

            //this.actor.raise_top(); // return dock to front of stage
            if (global.stage_input_mode == Shell.StageInputMode.NONREACTIVE)
                global.set_stage_input_mode(Shell.StageInputMode.NORMAL); // return stage to normal reactive mode

            Tweener.removeTweens(this.actor);
            Tweener.addTween(this.actor, {
                opacity: 255,
                time: time,
                delay: delay,
                transition: 'easeOutQuad',
                onComplete: Lang.bind(this, function() {
                })
            });
        }
    },

    // retrieve default background color
    _getBackgroundColor: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _getBackgroundColor");
        // Remove custom style
        let oldStyle = this._thumbnailsBox._background.get_style();
        this._thumbnailsBox._background.set_style(null);
        
        // Prevent shell crash if the actor is not on the stage
        // It happens enabling/disabling repeatedly the extension
        if (!this._thumbnailsBox._background.get_stage())
            return null;
            
        let themeNode = this._thumbnailsBox._background.get_theme_node();
        this._thumbnailsBox._background.set_style(oldStyle);
        
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

    // handler for workspace captions theme support changes
    _onThemeSupportChanged: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onThemeSupportChanged");
        let workspacesToDockExtStylesheet;
        if (this._gsCurrentVersion[1] < 6) {
            workspacesToDockExtStylesheet = GLib.build_filenamev([Me.path, 'themes', 'default', 'workspaces-to-dock-gs34.css']);
        } else {
            workspacesToDockExtStylesheet = GLib.build_filenamev([Me.path, 'themes', 'default', 'workspaces-to-dock.css']);
        }
        if (!GLib.file_test(workspacesToDockExtStylesheet, GLib.FileTest.EXISTS)) {
            return;
        }

        let themeContext = St.ThemeContext.get_for_stage(global.stage);
        if (themeContext) {
            let theme = themeContext.get_theme();
            if (theme) {
                let customStylesheets = theme.get_custom_stylesheets();
                if (this._settings.get_boolean('workspace-captions-support')) {
                    // Check if stylesheet already loaded
                    let found = false;
                    for (let i = 0; i < customStylesheets.length; i++) {
                        if (customStylesheets[i] == workspacesToDockExtStylesheet) {
                            found = true;
                            break;
                        }
                    }
                    if (found) {
                        // unload workspace captions css
                        theme.unload_stylesheet(workspacesToDockExtStylesheet);
                    }
                } else {
                    // Check if stylesheet already loaded
                    let found = false;
                    for (let i = 0; i < customStylesheets.length; i++) {
                        if (customStylesheets[i] == workspacesToDockExtStylesheet) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        // load workspace captions css
                        theme.load_stylesheet(workspacesToDockExtStylesheet);
                    }
                }
            }
        }
        
		if (this._gsCurrentVersion[1] < 7) {
            this._thumbnailsBox.hide();
            this._thumbnailsBox.show();
        } else {
            this._thumbnailsBox._destroyThumbnails();
            this._thumbnailsBox._createThumbnails();
        }
    },
    
    // handler for theme changes
    _onThemeChanged: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _onThemeChanged");
        this._updateBackgroundOpacity();
    },
    
    // resdiplay dock called if size-position changed due to dock resizing
    _redisplay: function() {
		if (this._disableRedisplay)
            return
            
        if (_DEBUG_) global.log("dockedWorkspaces: _redisplay");

        // Initial display of dock .. sets autohideStatus
        if (this._autohideStatus == null) {
            if (this._settings.get_boolean('dock-fixed')) {
                this._autohideStatus = true;
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
        this._updateClip();
    },

    // set dock width in vinsible/hidden states
    _setHiddenWidth: function() {
        let width;
        if (this._settings.get_boolean('dock-edge-visible')) {
            width = 1 + DOCK_EDGE_VISIBLE_WIDTH + DOCK_HIDDEN_WIDTH;
        } else {
            width = 1 + DOCK_HIDDEN_WIDTH;
        }
        this.actor.set_size(width, this.actor.height);
    },

    _unsetHiddenWidth: function() {
        let width = this._thumbnailsBox.actor.width + 1;
        this.actor.set_size(width, this.actor.height);
    },
    
    // update the dock size
    _updateSize: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _updateSize");

        // check if the dock is on the primary monitor
        let primary = false;
        if (this._monitor.x == Main.layoutManager.primaryMonitor.x && this._monitor.y == Main.layoutManager.primaryMonitor.y)
            primary = true;

        let x = this._monitor.x + this._monitor.width - this._thumbnailsBox.actor.width - 1;
        //let x2 = this._monitor.x + this._monitor.width - 1;

        let y;
        let height;
        if (this._settings.get_boolean('extend-height')) {
            let topMargin = Math.floor(this._settings.get_double('top-margin') * this._monitor.height);
            let bottomMargin = Math.floor(this._settings.get_double('bottom-margin') * this._monitor.height);
            if (primary) {
                y = this._monitor.y + Main.panel.actor.height + topMargin;
                height = this._monitor.height - Main.panel.actor.height - topMargin - bottomMargin;
            } else {
                y = this._monitor.y + topMargin;
                height = this._monitor.height - topMargin - bottomMargin;
            }
        } else {
            if (this._gsCurrentVersion[1] == 4) {
                if (primary) {
                    y = this._monitor.y + Main.overview._viewSelector.actor.y + Main.overview._viewSelector._pageArea.y;
                    height = Main.overview._viewSelector._pageArea.height;
                } else {
                    y = this._monitor.y + Main.overview._viewSelector.actor.y;
                    height = this._monitor.height - (Main.overview._viewSelector.actor.y + Main.messageTray.actor.height);
                }
            } else if (this._gsCurrentVersion[1] == 6) {
                if (primary) {
                    y = this._monitor.y + Main.overview._viewSelector.actor.y + Main.overview._viewSelector._pageArea.y;
                    height = this._monitor.height - (this._monitor.y + Main.overview._viewSelector.actor.y + Main.overview._viewSelector._pageArea.y + (Main.overview._viewSelector.actor.y/2) + Main.messageTray.actor.height);
                } else {
                    y = this._monitor.y + Main.overview._viewSelector.actor.y;
                    height = this._monitor.height - (Main.overview._viewSelector.actor.y + Main.messageTray.actor.height);
                }
            } else {
                if (primary) {
                    y = this._monitor.y + Main.panel.actor.height + Main.overview._searchEntryBin.y + Main.overview._searchEntryBin.height;
                    height = this._monitor.height - (Main.overview._searchEntryBin.y + Main.overview._searchEntryBin.height + Main.messageTray.actor.height);
                } else {
                    y = this._monitor.y + Main.overview._viewSelector.actor.y;
                    height = this._monitor.height - (Main.messageTray.actor.height);
                }
            }
        }

        // skip updating if size is same
        if ((this.actor.y == y) && (this.actor.width == this._thumbnailsBox.actor.width + 1) && (this.actor.height == height)) {
            if (_DEBUG_) global.log("dockedWorkspaces: _updateSize not necessary .. size the same");
            return;
        }
        
        // Updating size also resets the position of the staticBox (used to detect window overlaps)
        this.staticBox.init_rect(x, y, this._thumbnailsBox.actor.width + 1, height);
        
        // Updating size shouldn't reset the x position of the actor box (used to detect hover)
        // especially if it's in the hidden slid out position
        this.actor.y = y;
        this.actor.set_size(this._thumbnailsBox.actor.width + 1, height);

        this._thumbnailsBox.actor.set_position(1, 0); // position inside actor
        this._thumbnailsBox.actor.height = height;
    },
    
    // 'Hard' reset dock positon: called on start and when monitor changes
    _resetPosition: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _resetPosition");
        this._monitor = this._getMonitor();

        this._updateSize();

        //// check if the dock is on the primary monitor
        //let primary = false;
        //if (this._monitor.x == Main.layoutManager.primaryMonitor.x && this._monitor.y == Main.layoutManager.primaryMonitor.y)
        //    primary = true;

        let x = this._monitor.x + this._monitor.width - this._thumbnailsBox.actor.width - 1;
        let x2;
        if (this._settings.get_boolean('dock-edge-visible')) {
            x2 = this._monitor.x + this._monitor.width - 1 - DOCK_EDGE_VISIBLE_WIDTH;
        } else {
            x2 = this._monitor.x + this._monitor.width - 1;
        }

        if (this._settings.get_boolean('dock-fixed')) {
            //position on the screen (right side) so that its initial show is not animated
            //this.actor.set_position(x, y);
            this.actor.set_position(x, this.actor.y);
        } else {
            //position out of the screen (right side) so that its initial show is animated
            //this.actor.set_position(x2, y);
            this.actor.set_position(x2, this.actor.y);
        }

		this._updateBackgroundOpacity();
        this._updateClip();
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
    
    // Utility function to make the dock clipped to the primary monitor
    // clip dock to its original allocation along x and to the current monitor along y
    // the current monitor; inspired by dock@gnome-shell-extensions.gcampax.github.com
    _updateClip: function() {
        // Here we implicitly assume that the stage and actor's parent
        // share the same coordinate space
        let clip = new Clutter.ActorBox({
            x1: this._monitor.x,
            y1: this._monitor.y,
            x2: this._monitor.x + this._monitor.width,
            y2: this._monitor.y + this._monitor.height
        });

        // Translate back into actor's coordinate space
        // While the actor moves, the clip has to move in the opposite direction 
        // to mantain its position in respect to the screen.
        clip.x1 -= this.actor.x;
        clip.x2 -= this.actor.x;
        clip.y1 -= this.actor.y;
        clip.y2 -= this.actor.y;

        // Apply the clip
        this.actor.set_clip(clip.x1, clip.y1, clip.x2 - clip.x1, clip.y2 - clip.y1);
    },

    // Disable autohide effect, thus show workspaces
    disableAutoHide: function() {
		if (_DEBUG_) global.log("dockedWorkspaces: disableAutoHide - autohideStatus = "+this._autohideStatus);
        if (this._autohideStatus == true) {
            this._autohideStatus = false;

            // clear unnecesssary potentially running loops
            if (this._workspacesShowTimeout > 0)
                Mainloop.source_remove(this._workspacesShowTimeout);

            this._removeAnimations();
            this._animateIn(this._settings.get_double('animation-time'), 0);                

            if (this._settings.get_boolean('opaque-background') && !this._settings.get_boolean('opaque-background-always'))
                this._fadeOutBackground(this._settings.get_double('animation-time'), 0);

        }
    },

    // Enable autohide effect, hide workspaces
    enableAutoHide: function() {
		if (_DEBUG_) global.log("dockedWorkspaces: enableAutoHide - autohideStatus = "+this._autohideStatus);
        if (this._autohideStatus == false) {
            this._autohideStatus = true;
            
            let delay = 0; // immediately fadein background if hide is blocked by mouseover, otherwise start fadein when dock is already hidden.
            this._removeAnimations();

            if (this.actor.hover == true) {
                this.actor.sync_hover();
            }

            if (!this.actor.hover || !this._settings.get_boolean('autohide')) {
                if (_DEBUG_) global.log("dockedWorkspaces: enableAutoHide - mouse not hovering OR dock not using autohide, so animate out");
                this._animateOut(this._settings.get_double('animation-time'), 0);
                delay = this._settings.get_double('animation-time');
            } else {
                if (_DEBUG_) global.log("dockedWorkspaces: enableAutoHide - mouse hovering AND dock using autohide, so startWorkspacesShowLoop instead of animate out");
                // I'm enabling autohide and the workspaces keeps being showed because of mouse hover
                // so i start the loop usualy started by _show()
                this._startWorkspacesShowLoop();

                delay = 0;
            }

            if (this._settings.get_boolean('opaque-background') && !this._settings.get_boolean('opaque-background-always')) {
                this._fadeInBackground(this._settings.get_double('animation-time'), delay);
            }
        }
    }

};
Signals.addSignalMethods(dockedWorkspaces.prototype);

/*
 * Store animation status in a perhaps overcomplicated way.
 * status is true for visible, false for hidden
 */
function animationStatus(initialStatus) {
    this._init(initialStatus);
}

animationStatus.prototype = {

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
}
