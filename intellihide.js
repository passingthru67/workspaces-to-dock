/* ========================================================================================================
 * intellihide.js - intellihide functions
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  This code was copied from the dash-to-dock extension https://github.com/micheleg/dash-to-dock
 *  and modified to create a workspaces dock. Many thanks to michele_g for a great extension.
 * ========================================================================================================
 */

const _DEBUG_ = false;

const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;
const Signals = imports.signals;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
//const GrabHelper = imports.ui.grabHelper;
let GrabHelper = null;

const ViewSelector = imports.ui.viewSelector;
const Tweener = imports.ui.tweener;
const Params = imports.misc.params;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const handledWindowTypes = [
    Meta.WindowType.NORMAL,
    // Meta.WindowType.DESKTOP,    // skip nautilus dekstop window
    // Meta.WindowType.DOCK,       // skip other docks
    Meta.WindowType.DIALOG,
    Meta.WindowType.MODAL_DIALOG,
    Meta.WindowType.TOOLBAR,
    Meta.WindowType.MENU,
    Meta.WindowType.UTILITY,
    Meta.WindowType.SPLASHSCREEN
];

const handledWindowTypes2 = [
    Meta.WindowType.POPUP_MENU,
    Meta.WindowType.DROPDOWN_MENU,
    Meta.WindowType.TOOLTIP
];

const IntellihideMode = {
    HIDE: 0,        // Workspaces is always invisible
    SHOW: 1,        // Workspaces is always visible
    AUTOHIDE: 2,    // Basic autohide mode: visible on mouse hover
    INTELLIHIDE: 3  // Basic intellihide mode: visible if no window overlap the workspaces
};

const OVERVIEW_MODE = IntellihideMode.SHOW;


/*
 * A rough and ugly implementation of the intellihide behaviour.
 * Intallihide object: call show()/hide() function based on the overlap with the
 * the target actor object;
 * 
 * Target object has to contain a Clutter.ActorBox object named staticBox and 
 * emit a 'box-changed' signal when this changes.
 * 
*/

let intellihide = function(target, settings, gsCurrentVersion) {
    this._gsCurrentVersion = gsCurrentVersion;
    if (this._gsCurrentVersion[1] == "6")
        grabHelper = imports.ui.grabHelper;
        
    this._init(target, settings);
}

intellihide.prototype = {

    _init: function(target, settings) {
		// temporarily disable intellihide until initialized (prevents connected signals from trying to update dock visibility)
		this._disableIntellihide = true;
		if (_DEBUG_) global.log("intellihide: init - disaableIntellihide");
		
		// Override Gnome Shell functions
		this._overrideGnomeShellFunctions();
		
        // Load settings
        this._settings = settings;
        this._bindSettingsChanges();

        this._signalHandler = new Convenience.globalSignalHandler();
        this._tracker = Shell.WindowTracker.get_default();
        this._topWindow = null;
        this._focusApp = null;

        // current intellihide status is null
        this.status;

        // Target object
        this._target = target;
        // Keep track of the current overview mode (I mean if it is on/off)
        this._inOverview = false;

        // Main id of the timeout controlling timeout for updateDockVisibility function 
        // when windows are dragged around (move and resize)
        this._windowChangedTimeout = 0;

        // Connect global signals
        this._signalHandler.push(
            // call updateVisibility when target actor changes
            [
                this._target,
                'box-changed',
                Lang.bind(this, this._onDockSettingsChanged)
            ],
            // Add timeout when window grab-operation begins and remove it when it ends.
            // These signals only exist starting from Gnome-Shell 3.4
            [
                global.display,
                'grab-op-begin',
                Lang.bind(this, this._grabOpBegin)
            ],
            [
                global.display,
                'grab-op-end',
                Lang.bind(this, this._grabOpEnd)
            ],
            // direct maximize/unmazimize are not included in grab-operations
            [
                global.window_manager,
                'maximize', 
                Lang.bind(this, this._onWindowMaximized)
            ],
            [
                global.window_manager,
                'unmaximize',
                Lang.bind(this, this._onWindowUnmaximized )
            ],
            // Probably this is also included in restacked?
            [
                global.window_manager,
                'switch-workspace',
                Lang.bind(this, this._switchWorkspace)
            ],
            // trigggered for instance when a window is closed.
            [
                global.screen,
                'restacked',
                Lang.bind(this, this._onScreenRestacked)
            ],
            // Set visibility in overview mode
            [
                Main.overview,
                'showing',
                Lang.bind(this, this._overviewEnter)
            ],
            [
                Main.overview,
                'hiding',
                Lang.bind(this,this._overviewExit)
            ],
            // update when monitor changes, for instance in multimonitor when monitors are attached
            [
                global.screen,
                'monitors-changed',
                Lang.bind(this, this._onMonitorsChanged)
            ]
        );

        switch (this._gsCurrentVersion[1]) {
            case"4":
                this._signalHandler.push(
                    // Gnome Shell 3.4 signals
                    [
                        Main.messageTray._focusGrabber,
                        'focus-grabbed',
                        Lang.bind(this, this._onTrayFocusGrabbed)
                    ],
                    [
                        Main.messageTray._focusGrabber,
                        'focus-ungrabbed',
                        Lang.bind(this, this._onTrayFocusUngrabbed)
                    ],
                    [
                        Main.panel._menus,
                        'menu-added',
                        Lang.bind(this, this._onPanelMenuAdded)
                    ]
                );
                // Detect viewSelector Tab signals in overview mode
                for (let i = 0; i < Main.overview._viewSelector._tabs.length; i++) {
                    this._signalHandler.push([Main.overview._viewSelector._tabs[i], 'activated', Lang.bind(this, this._overviewChanged)]);
                }
                // Detect Search started and cancelled
                this._signalHandler.push([Main.overview._viewSelector._searchTab, 'activated', Lang.bind(this, this._searchStarted)]);
                this._signalHandler.push([Main.overview._viewSelector._searchTab, 'search-cancelled', Lang.bind(this, this._searchCancelled)]);
                break;
            case"6":
                this._signalHandler.push(
                    // Gnome Shell 3.6 signals
                    [
                        Main.messageTray._grabHelper,
                        'focus-grabbed',
                        Lang.bind(this, this._onTrayFocusGrabbed)
                    ],
                    [
                        Main.messageTray._grabHelper,
                        'focus-ungrabbed',
                        Lang.bind(this, this._onTrayFocusUngrabbed)
                    ],
                    [
                        Main.panel.menuManager,
                        'menu-added',
                        Lang.bind(this, this._onPanelMenuAdded)
                    ],
                    [
                        Main.overview._viewSelector,
                        'show-page',
                        Lang.bind(this, this._overviewChanged)
                    ]
                );
                break;
            default:
                throw new Error("Unknown version number (intellihide.js).");
        }

		if (_DEBUG_) global.log("intellihide: init - signals being captured");
        
        // Start main loop and bind initialize function
        Mainloop.idle_add(Lang.bind(this, this._initialize));
    },

    _initialize: function() {
		if (_DEBUG_) global.log("intellihide: initializing");
        // Detect gnome panel popup menus.  Reason for detection being here instead of during init
        // is because it needs to be done after all the panel extensions have loaded
        switch (this._gsCurrentVersion[1]) {
            case"4":
                for (let i = 0; i < Main.panel._menus._menus.length; i++) {
                    this._signalHandler.push([Main.panel._menus._menus[i].menu, 'open-state-changed', Lang.bind(this, this._onPanelMenuStateChange)]);
                }
                break;
            case"6":
                for (let i = 0; i < Main.panel.menuManager._menus.length; i++) {
                    this._signalHandler.push([Main.panel.menuManager._menus[i].menu, 'open-state-changed', Lang.bind(this, this._onPanelMenuStateChange)]);
                }
                break;
            default:
                throw new Error("Unknown version number (intellihide.js).");
        }

        // enable intellihide now
        this._disableIntellihide = false;
        if (_DEBUG_) global.log("intellihide: initialize - turn on intellihide");
        
        // updte dock visibility
        this._updateDockVisibility();
        
    },
    
    destroy: function() {
        if (_DEBUG_) global.log("intellihide: destroying");
        // Disconnect global signals
        this._signalHandler.disconnect();

        if (this._windowChangedTimeout > 0)
            Mainloop.source_remove(this._windowChangedTimeout); // Just to be sure

		this._restoreGnomeShellFunctions();
    },

	_onDockSettingsChanged: function() {
		if (_DEBUG_) global.log("intellihide: _onDockSettingsChanged");
		this._updateDockVisibility();
	},
	
	_onWindowMaximized: function() {
		if (_DEBUG_) global.log("intellihide: _onWindowMaximized");
		this._updateDockVisibility();
	},
	
	_onWindowUnmaximized: function() {
		if (_DEBUG_) global.log("intellihide: _onWindowUnmaximized");
		this._updateDockVisibility();
	},
	
	_onScreenRestacked: function() {
		if (_DEBUG_) global.log("intellihide: _onScreenRestacked");
		this._updateDockVisibility();
	},
	
	_onMonitorsChanged: function() {
		if (_DEBUG_) global.log("intellihide: _onMonitorsChanged");
		this._updateDockVisibility();
	},
	

    _overrideGnomeShellFunctions: function() {
        if (_DEBUG_) global.log("intellihide: _overrideGnomeShellFunctions");
        switch (this._gsCurrentVersion[1]) {
            case"4":
                this._overrideGnomeShell34Functions();
                break;
            case"6":
                this._overrideGnomeShell36Functions();
                break;
            default:
                throw new Error("Unknown version number (intellihide.js).");
        }
    },

    _restoreGnomeShellFunctions: function() {
        if (_DEBUG_) global.log("intellihide: _restoreGnomeShellFunctions");
        switch (this._gsCurrentVersion[1]) {
            case"4":
                this._restoreGnomeShell34Functions();
                break;
            case"6":
                this._restoreGnomeShell36Functions();
                break;
            default:
                throw new Error("Unknown version number (intellihide.js).");
        }
    },
    
    _overrideGnomeShell34Functions: function() {
        // Override the PopupMenuManager addMenu function to emit a signal when new menus are added
		// Copied from Gnome Shell .. emit 'menu-added' added
        let p = PopupMenu.PopupMenuManager.prototype;
        this.saved_PopupMenuManager_addMenu = p.addMenu;
        p.addMenu = function(menu, position) {
            let menudata = {
                menu:              menu,
                openStateChangeId: menu.connect('open-state-changed', Lang.bind(this, this._onMenuOpenState)),
                childMenuAddedId:  menu.connect('child-menu-added', Lang.bind(this, this._onChildMenuAdded)),
                childMenuRemovedId: menu.connect('child-menu-removed', Lang.bind(this, this._onChildMenuRemoved)),
                destroyId:         menu.connect('destroy', Lang.bind(this, this._onMenuDestroy)),
                enterId:           0,
                focusInId:         0
            };

            let source = menu.sourceActor;
            if (source) {
                menudata.enterId = source.connect('enter-event', Lang.bind(this, function() { this._onMenuSourceEnter(menu); }));
                menudata.focusInId = source.connect('key-focus-in', Lang.bind(this, function() { this._onMenuSourceEnter(menu); }));
            }

            if (position == undefined)
                this._menus.push(menudata);
            else
                this._menus.splice(position, 0, menudata);
            
            this.emit("menu-added", menu);
        };
        Signals.addSignalMethods(PopupMenu.PopupMenuManager.prototype);
    },
    
	_overrideGnomeShell36Functions: function() {
        if (_DEBUG_) global.log("intellihide: _overrideGnomeShellFunctions");
        // Override the ViewSelector showPage function to emit a signal when overview page changes
		// Copied from Gnome Shell .. emit 'show-page' added
        let p = ViewSelector.ViewSelector.prototype;
        this.saved_ViewSelector_showPage = p._showPage;
		p._showPage = function(page) {
			if(page == this._activePage)
				return;

			if(this._activePage) {
				Tweener.addTween(this._activePage,
								 { opacity: 0,
								   time: 0.1,
								   transition: 'easeOutQuad',
								   onComplete: Lang.bind(this,
									   function() {
										   this._activePage.hide();
										   this._activePage = page;
									   })
								 });
			}

			page.show();
			this.emit('show-page', page);
			Tweener.addTween(page,
							 { opacity: 255,
							   time: 0.1,
							   transition: 'easeOutQuad'
							 });
		};

        // Override the PopupMenuManager addMenu function to emit a signal when new menus are added
		// Copied from Gnome Shell .. emit 'menu-added' added
        let p = PopupMenu.PopupMenuManager.prototype;
        this.saved_PopupMenuManager_addMenu = p.addMenu;
        p.addMenu = function(menu, position) {
            if (this._findMenu(menu) > -1)
                return;

            let menudata = {
                menu:              menu,
                openStateChangeId: menu.connect('open-state-changed', Lang.bind(this, this._onMenuOpenState)),
                childMenuAddedId:  menu.connect('child-menu-added', Lang.bind(this, this._onChildMenuAdded)),
                childMenuRemovedId: menu.connect('child-menu-removed', Lang.bind(this, this._onChildMenuRemoved)),
                destroyId:         menu.connect('destroy', Lang.bind(this, this._onMenuDestroy)),
                enterId:           0,
                focusInId:         0
            };

            let source = menu.sourceActor;
            if (source) {
                menudata.enterId = source.connect('enter-event', Lang.bind(this, function() { this._onMenuSourceEnter(menu); }));
                menudata.focusInId = source.connect('key-focus-in', Lang.bind(this, function() { this._onMenuSourceEnter(menu); }));
            }

            if (position == undefined)
                this._menus.push(menudata);
            else
                this._menus.splice(position, 0, menudata);

            this.emit("menu-added", menu);
        };
        Signals.addSignalMethods(PopupMenu.PopupMenuManager.prototype);

        // Override the GrabHelper grab function to emit a signal when focus is grabbed
		// Copied from Gnome Shell .. emit 'focus-grabbed' added
        let p = GrabHelper.GrabHelper.prototype;
		this.saved_GrabHelper_grab = p.grab;
		p.grab = function(params) {
            params = Params.parse(params, { actor: null,
                                            modal: false,
                                            grabFocus: false,
                                            onUngrab: null });

            let focus = global.stage.key_focus;
            let hadFocus = focus && this._isWithinGrabbedActor(focus);
            let newFocus = params.actor;

            if (this.isActorGrabbed(params.actor))
                return true;

            params.savedFocus = focus;

            if (params.modal && !this._takeModalGrab())
                return false;

            if (params.grabFocus && !this._takeFocusGrab(hadFocus))
                return false;

            if (hadFocus || params.grabFocus)
               GrabHelper._navigateActor(newFocus);

            this._grabStack.push(params);
            this.emit('focus-grabbed');
            return true;
		};


        // Override the GrabHelper ungrab function to emit a signal when focus is ungrabbed
		// Copied from Gnome Shell .. emit 'focus-ungrabbed' added
		let p = GrabHelper.GrabHelper.prototype;
		this.saved_GrabHelper_ungrab = p.ungrab;
		p.ungrab = function(params) {
            params = Params.parse(params, { actor: this.currentGrab.actor });

            let grabStackIndex = this._findStackIndex(params.actor);
            if (grabStackIndex < 0)
                return;

            let focus = global.stage.key_focus;
            let hadFocus = focus && this._isWithinGrabbedActor(focus);

            let poppedGrabs = this._grabStack.slice(grabStackIndex);
            // "Pop" all newly ungrabbed actors off the grab stack
            // by truncating the array.
            this._grabStack.length = grabStackIndex;

            for (let i = poppedGrabs.length - 1; i >= 0; i--) {
                let poppedGrab = poppedGrabs[i];

                if (poppedGrab.onUngrab)
                    poppedGrab.onUngrab();

                if (poppedGrab.modal)
                    this._releaseModalGrab();

                if (poppedGrab.grabFocus)
                    this._releaseFocusGrab();
            }

            if (hadFocus) {
                let poppedGrab = poppedGrabs[0];
                GrabHelper._navigateActor(poppedGrab.savedFocus);
            }

            this.emit('focus-ungrabbed');
		};
		Signals.addSignalMethods(GrabHelper.GrabHelper.prototype);
	},
	
	_restoreGnomeShell34Functions: function() {
        // Restore normal PopupMenuManager addMenu function
        let p = PopupMenu.PopupMenuManager.prototype;
        p.addMenu = this.saved_PopupMenuManager_addMenu;
    },
    
    _restoreGnomeShell36Functions: function() {
		// Restore normal ViewSelector showPage function
        let p = ViewSelector.ViewSelector.prototype;
        p._showPage = this.saved_ViewSelector_showPage;

        // Restore normal PopupMenuManager addMenu function
        let p = PopupMenu.PopupMenuManager.prototype;
        p.addMenu = this.saved_PopupMenuManager_addMenu;
        
        // Restore normal GrabHelper grab function
        let p = GrabHelper.GrabHelper.prototype;
        p.grab = this.saved_GrabHelper_grab;
        
        // Restore normal GrabHelper ungrab function
        let p = GrabHelper.GrabHelper.prototype;
        p.ungrab = this.saved_GrabHelper_ungrab;
	},
	
    _bindSettingsChanges: function() {
        this._settings.connect('changed::intellihide', Lang.bind(this, function() {
            if (_DEBUG_) global.log("intellihide: _bindSettingsChanges for intellihide");
            this._updateDockVisibility();
        }));

        this._settings.connect('changed::intellihide-top-window-only', Lang.bind(this, function(){
            if (_DEBUG_) global.log("intellihide: _bindSettingsChanges for intellihide-top-window-only");
            this._updateDockVisibility();
        }));

        this._settings.connect('changed::dock-fixed', Lang.bind(this, function() {
			if (_DEBUG_) global.log("intellihide: _bindSettingsChanges for dock-fixed");
            if (this._settings.get_boolean('dock-fixed')) {
                this.status = true; // Since the dock is now shown
            } else {
                // Wait that windows rearrange after struts change
                Mainloop.idle_add(Lang.bind(this, function() {
                    this._updateDockVisibility();
                    return false;
                }));
            }
        }));
    },

    _show: function() {
        if (this.status == null || this.status == false) {
            if (this._settings.get_boolean('dock-fixed')) {
                if (_DEBUG_) global.log("intellihide: _show - fadeInDock");
				if (this.status == null) {
                    // do slow fade in when first showing dock
                    this._target.fadeInDock(this._settings.get_double('animation-time'), 0);
                } else {
                    // do a quick fade in afterward .. don't know why but slow animation sometimes leaves the fixed dock barely visible
                    this._target.fadeInDock(.05, 0);
                }
            } else {
				if (_DEBUG_) global.log("intellihide: _show - disableAutoHide");
				if (this.status == null) {
					//this._target.disableAutoHide(true); // no animation
                    this._target.disableAutoHide();
				} else {
					this._target.disableAutoHide();
				}
            }
            this.status = true;
		}
    },

    _hide: function(nonreactive) {
        if (this.status == null || this.status == true) {
            this.status = false;
            if (this._settings.get_boolean('dock-fixed')) {
                if (_DEBUG_) global.log("intellihide: _hide - fadeOutDock");
                if (nonreactive) {
                    // hide and make stage nonreactive so meta popup windows receive hover and clicks
                    this._target.fadeOutDock(this._settings.get_double('animation-time'), 0, true);
                } else {
                    this._target.fadeOutDock(this._settings.get_double('animation-time'), 0, false);
                }
            } else {
				if (_DEBUG_) global.log("intellihide: _hide - enableAutoHide");
                this._target.enableAutoHide();
            }
        }
    },

    _overviewExit: function() {
        if (_DEBUG_) global.log("intellihide: _overviewExit");
        this._inOverview = false;
        this._updateDockVisibility();

    },

    _overviewEnter: function() {
        if (_DEBUG_) global.log("intellihide: _overviewEnter");
        this._inOverview = true;
        if (OVERVIEW_MODE == IntellihideMode.SHOW) {
            this._show();
        } else if (OVERVIEW_MODE == IntellihideMode.AUTOHIDE) {
            this._hide();
        } else if (OVERVIEW_MODE == IntellihideMode.INTELLIHIDE) {
            this._show();
        } else if (OVERVIEW_MODE == IntellihideMode.HIDE) {
            /*TODO*/
        }
    },

    // This function was added to handle changes in overview mode
    // for example, when Applications button is clicked the workspaces dock is hidden
    // or when search is started the workspaces dock is hidden
    _overviewChanged: function(source, page) {
        if (_DEBUG_) global.log("intellihide: _overviewChanged");
        if (page == Main.overview._viewSelector._workspacesPage) {
            this._show();
        } else {
            this._hide();
        }
    },

    _searchStarted: function() {
      this._hide();
    },

    _searchCancelled: function() {
        if (Main.overview._viewSelector._activeTab.id == "windows") {
            this._show();
        } else {
            this._hide();
        }
    },

    _onTrayFocusGrabbed: function(source, event) {
        let focusedActor;
        switch (this._gsCurrentVersion[1]) {
            case "4":
                focusedActor = source.actor;
                break;
            case "6":
                let idx = source._grabStack.length - 1;
                focusedActor = source._grabStack[idx].actor;
                break;
            default:
                throw new Error("Unknown version number (intellihide.js).");
        }
		let [rx, ry] = focusedActor.get_transformed_position();
        let [rwidth, rheight] = focusedActor.get_size();
        let test = (rx < this._target.staticBox.x2) && (rx + rwidth > this._target.staticBox.x1) && (ry - rheight < this._target.staticBox.y2) && (ry > this._target.staticBox.y1);
        if (_DEBUG_) global.log("intellihide: onTrayFocusGrabbed actor = "+focusedActor+"  position = "+focusedActor.get_transformed_position()+" size = "+focusedActor.get_size()+" test = "+test);
        if (test) {
            this._disableIntellihide = true;
            this._hide();
        }
    },

    _onTrayFocusUngrabbed: function(source, event) {
        if (_DEBUG_) global.log("intellihide: onTrayFocusUnGrabbed");
        this._disableIntellihide = false;
        if (this._inOverview) {
            switch (this._gsCurrentVersion[1]) {
                case "4":
                    if (Main.overview._viewSelector._activeTab.id == "windows") this._show();
                    break;
                case "6":
                    if (Main.overview._viewSelector._activePage == Main.overview._viewSelector._workspacesPage) this._show();
                    break;
                default:
                    throw new Error("Unknown version number (intellihide.js).");
            }
        } else {
            this._updateDockVisibility();
        }
    },

    _onPanelMenuStateChange: function(menu, open) {
        if (open) {
            if (_DEBUG_) global.log("intellihide: _onPanelMenuStateChange - open");
            let [rx, ry] = menu.actor.get_transformed_position();
            let [rwidth, rheight] = menu.actor.get_size();
            let test = (rx < this._target.staticBox.x2) && (rx + rwidth > this._target.staticBox.x1) && (ry < this._target.staticBox.y2) && (ry + rheight > this._target.staticBox.y1);
            if (test) {
                this._hide();
            }
        } else {
            if (_DEBUG_) global.log("intellihide: _onPanelMenuStateChange - closed");
            if (this._inOverview) {
                switch (this._gsCurrentVersion[1]) {
                    case "4":
                        if (Main.overview._viewSelector._activeTab.id == "windows") this._show();
                        break;
                    case "6":
                        if (Main.overview._viewSelector._activePage == Main.overview._viewSelector._workspacesPage) this._show();
                        break;
                    default:
                        throw new Error("Unknown version number (intellihide.js).");
                }
            } else {
                this._updateDockVisibility();
            }
        }
    },

    _onPanelMenuAdded: function(source, menu) {
        if (_DEBUG_) global.log("intellihide: _onPanelMenuAdded");
        // We need to push signals for new panel menus added after initialization
        this._signalHandler.push([menu, 'open-state-changed', Lang.bind(this, this._onPanelMenuStateChange)]);
    },

    _grabOpBegin: function() {
		if (_DEBUG_) global.log("intellihide: _grabOpBegin");
        if (this._settings.get_boolean('intellihide')) {
            let INTERVAL = 100; // A good compromise between reactivity and efficiency; to be tuned.

            if (this._windowChangedTimeout > 0)
                Mainloop.source_remove(this._windowChangedTimeout); // Just to be sure
            
            this._windowChangedTimeout = Mainloop.timeout_add(INTERVAL, 
                Lang.bind(this, function() {
                    this._updateDockVisibility();
                    return true; // to make the loop continue
                })
            );
        }
    },

    _grabOpEnd: function() {
		if (_DEBUG_) global.log("intellihide: _grabOpEnd");
        if (this._settings.get_boolean('intellihide')) {
            if (this._windowChangedTimeout > 0)
                Mainloop.source_remove(this._windowChangedTimeout);

            this._updateDockVisibility();
        }
    },

    _switchWorkspace: function(shellwm, from, to, direction) {
		if (_DEBUG_) global.log("intellihide: _switchWorkspace");
        this._updateDockVisibility();
    },

    _updateDockVisibility: function() {
        if (this._disableIntellihide)
            return;

        // If we are in overview mode and the dock is set to be visible prevent 
        // it to be hidden by window events(window create, workspace change, 
        // window close...)
        if (this._inOverview) {
            if (OVERVIEW_MODE !== IntellihideMode.INTELLIHIDE) {
                return;
            }
        }

        //else in normal mode:
        else {
            if (this._settings.get_boolean('intellihide') || this._settings.get_boolean('dock-fixed')) {
                if (_DEBUG_) global.log("intellihide: updateDockVisibility - normal mode");
                let overlaps = false;
                //let windows = global.get_window_actors().filter(this._intellihideFilterInteresting, this);
                let windows = global.get_window_actors();

                if (windows.length > 0) {
                    // This is the window on top of all others in the current workspace
                    this._topWindow = windows[windows.length-1].get_meta_window();

                    // If there isn't a focused app, use that of the window on top
                    this._focusApp = this._tracker.focus_app || this._tracker.get_window_app(this._topWindow);

                    windows = windows.filter(this._intellihideFilterInteresting, this);
                
                    for (let i = 0; i < windows.length; i++) {
                        let win = windows[i].get_meta_window();
                        if (win) {
                            let rect = win.get_outer_rect();
                            let test = (rect.x < this._target.staticBox.x2) && (rect.x + rect.width > this._target.staticBox.x1) && (rect.y < this._target.staticBox.y2) && (rect.y + rect.height > this._target.staticBox.y1);
                            if (test) {
                                overlaps = true;
                                break;
                            }
                        }
                    }
                }
                
                if (_DEBUG_) global.log("intellihide: updateDockVisiblity - overlaps = "+overlaps);
                if (overlaps) {
                    this._hide(true); // hide and make stage nonreactive so meta popup windows receive hover and clicks
                } else {
                    this._show();
                }
            } else {
                this._hide();
            }
        }

    },

    // Filter interesting windows to be considered for intellihide.
    // Consider all windows visible on the current workspace.
    _intellihideFilterInteresting: function(wa, edge) {
        var currentWorkspace = global.screen.get_active_workspace_index();
        var meta_win = wa.get_meta_window();
        if (!meta_win) { //TODO michele: why? What does it mean?
            return false;
        }

        if (!this._handledWindowType(meta_win))
            return false;

        var wksp = meta_win.get_workspace();
        var wksp_index = wksp.index();

        // intellihide-top-window-only -- dodges top window only
        if (this._settings.get_boolean('intellihide-top-window-only')) {
            if (this._topWindow && this._focusApp) {
                // Ignore if not top window and not focused app
                let metaWindowApp = this._tracker.get_window_app(meta_win);
                if (this._topWindow != meta_win && this._focusApp != metaWindowApp) {
                    // Special consideration for half maximized windows, useful if one is using two apps side by side
                    //if (!(meta_win.maximized_vertically && !meta_win.maximized_horizontally))
                        return false;
                }
            }
        }
        
        if (wksp_index == currentWorkspace && meta_win.showing_on_its_workspace()) {
            return true;
        } else {
            return false;
        }
    },

    // Filter windows by type
    // inspired by Opacify@gnome-shell.localdomain.pl
    _handledWindowType: function(metaWindow) {
        var wtype = metaWindow.get_window_type();
        if (!this._settings.get_boolean('dock-fixed')) {
            // Test primary window types .. only if dock is not fixed
            for (var i = 0; i < handledWindowTypes.length; i++) {
                var hwtype = handledWindowTypes[i];
                if (hwtype == wtype) {
                    return true;
                }
            }
        }
        // Test secondary window types .. even if dock is fixed
        for (var i = 0; i < handledWindowTypes2.length; i++) {
            var hwtype = handledWindowTypes2[i];
            if (hwtype == wtype) {
                return true;
            }
        }
        
        return false;
    }

};
