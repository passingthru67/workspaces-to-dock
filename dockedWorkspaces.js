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

const Me = imports.ui.extensionSystem.extensions["workspaces-to-dock@passingthru67.gmail.com"];
const Convenience = Me.convenience;
const MyThumbnailsBox = Me.myThumbnailsBox;

// Settings backported for GS 3.2 .. settings also need to be adjusted in intellihide.js -------------------
const ANIMATION_TIME = Overview.ANIMATION_TIME; // show/hide transition time
const SHOW_DELAY     = 0.500; // delay before showing dash when it's hidden 
const HIDE_DELAY     = 0.250; // delay befoee hiding dash when mouse goes out
const OPAQUE_BACKGROUND = true; // make the dash opaque increasing readability. Some themes like the default one have a transparent bacground.
const BACKGROUND_OPACITY = 0.8; // set dash background opacity if key above is true
const OPAQUE_BACKGROUND_ALWAYS = false; // whether the dash has always an opaque background or only when in autohide mode
const AUTOHIDE = true; // Enable or disable autohide mode
const DOCK_FIXED = false; //Dock is always visible
const HEIGHT_SUBTRACT = 0;
// End Settings --------------------------------------------------------------------------------------------

function dockedWorkspaces() {
    this._init();
}

dockedWorkspaces.prototype = {

    _init: function() {
        // temporarily disable redisplay until initialized (prevents connected signals from trying to update dock visibility)
        this._disableRedisplay = true;
        if (_DEBUG_) global.log("dockedWorkspaces: init - disableRediplay");
        
        this._signalHandler = new Convenience.globalSignalHandler();

        // Timeout id used to ensure the workspaces is hidden after some menu is shown
        this._workspacesShowTimeout = 0;

        // Authohide current status. Not to be confused with autohide enable/disagle global (g)settings
        // Initially set to null - will be set during first redisplay
        this._autohideStatus = null;
        
        // initialize animation status object
        this._animStatus = new animationStatus(true);

        // Override Gnome Shell functions
        this._overrideGnomeShellFunctions();

        // Create a new thumbnailsbox object
        this._thumbnailsBox = new MyThumbnailsBox.myThumbnailsBox();
		
        // Create the main container, turn on track hover, add hoverChange signal
        this.actor = new St.BoxLayout({
            name: 'workspacestodockContainer',
            reactive: true,
            track_hover: true
        });
        this.actor.connect("notify::hover", Lang.bind(this, this._hoverChanged));
        this.actor.connect("scroll-event", Lang.bind(this, this._onScrollEvent));
        // Using actor realize in GS3.2 caused dock to initially show sized improperly
        //this._realizeId = this.actor.connect("realize", Lang.bind(this, this._initialize));

        // Sometimes Main.wm._workspaceSwitcherPopup is null when first loading the 
        // extension causing scroll-event problems
        if (Main.wm._workspaceSwitcherPopup == null) {
            Main.wm._workspaceSwitcherPopup = new WorkspaceSwitcherPopup.WorkspaceSwitcherPopup();
        }

        // Create the background box and set opacity
        this._backgroundBox = new St.Bin({
            name: 'workspacestodockBackground',
            reactive: false,
            y_align: St.Align.START,
            style_class: 'workspace-thumbnails-background'
        });
        this._backgroundBox.set_style('background-color: rgba(1,1,1,' + BACKGROUND_OPACITY + ')');

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
                Main.overview._viewSelector._pageArea,
                'notify::y',
                Lang.bind(this, this._updateYPosition)
            ],
            [
                Main.overview._viewSelector._pageArea,
                'notify::height',
                Lang.bind(this, this._updateHeight)
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
                global.screen,
                'restacked',
                Lang.bind(this, this._workspacesRestacked)
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
            ],
            [
                global.screen,
                'workspace-switched',
                Lang.bind(this, this._workspacesRestacked)
            ],
            [
                Main.messageTray.actor,
                'notify::height',
                Lang.bind(this, this._updateHeight)
            ]
        );
        if (_DEBUG_) global.log("dockedWorkspaces: init - signals being captured");

        //Hide the dock whilst setting positions
        //this.actor.hide(); but I need to access its width, so I use opacity
        this.actor.set_opacity(0);

        // Add workspaces and backgroundBox to the main container actor and then to the Chrome.
        this.actor.add_actor(this._backgroundBox);
        this.actor.add_actor(this._thumbnailsBox.actor);

        Main.layoutManager.addChrome(this.actor, {
            affectsStruts: DOCK_FIXED,
            affectsInputRegion: true
        });

	// Using actor realize in GS3.2 caused dock to initially show sized improperly
	// Went back to using Mainloop idle for GS3.2
	Mainloop.idle_add(Lang.bind(this, this._initialize));
    },

    _initialize: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: initializing");
        // Using actor realize in GS3.2 caused dock to initially show sized improperly
        //if(this._realizeId > 0){
        //    this.actor.disconnect(this._realizeId);
        //    this._realizeId = 0;
        //}

        // GS3.4 workaround to get correct size and position of actor inside the overview
        Main.overview._group.show();
        Main.overview._group.hide();

        
        // Show the thumbnailsBox.  We need it to calculate the width of the dock.
        this._thumbnailsBox.show();
        
        // Set initial position
        this._resetPosition();

        if (!DOCK_FIXED) {
            // Show the non-fixed dock (off screen from resetPosition)
            // note: fixed dock already on screen and will animate opacity to 255 when fadeInDock is called
            this.actor.set_opacity(255);
        }

        this._disableRedisplay = false;
        if (_DEBUG_) global.log("dockedWorkspaces: initialize - turn on redisplay");
        
        // Not really required in GS3.4 or GS3.6 because thumbnailsBox width signal will trigger a redisplay
        // Also found GS3.6 crashes returning from lock screen (Ubuntu GS Remix)
        // Required in GS3.2 to initially show
        this._redisplay();
    },

    destroy: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: destroying");
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
        // Override the WorkspacesDisplay updateAlwaysZoom function
        // Force normal workspaces to be always zoomed
        let p = WorkspacesView.WorkspacesDisplay.prototype;
        this.saved_updateAlwaysZoom = p._updateAlwaysZoom;
        p._updateAlwaysZoom = function() {
            this._alwaysZoomOut = true;
        };

        // Set zoom status to true & hide normal workspaces thumbnailsBox
        Main.overview._workspacesDisplay._alwaysZoomOut = true;
        Main.overview._workspacesDisplay._thumbnailsBox.actor.hide();
    },
    
    // function called during destroy to restore gnome shell 3.4/3.6/#
    _restoreGnomeShellFunctions: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _restoreGnomeShellFunctions");
        // Restore normal workspaces to previous zoom setting
        let p = WorkspacesView.WorkspacesDisplay.prototype;
        p._updateAlwaysZoom = this.saved_updateAlwaysZoom;

        // Restore zoom status to false & normal workspaces thumbnailsBox to show
        Main.overview._workspacesDisplay._alwaysZoomOut = false;
        Main.overview._workspacesDisplay._updateAlwaysZoom();
        Main.overview._workspacesDisplay._thumbnailsBox.actor.show();
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
            this._thumbnailsBox.removeThumbmails(removedIndex, removedNum);
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

    // handler for mouse hover events
    _hoverChanged: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _hoverChanged");
        //Skip if dock is not in autohide mode for instance because it is shown by intellihide
        if (AUTOHIDE && this._autohideStatus) {
            if (this.actor.hover) {
                this._show();
            } else {
                this._hide();
            }
        }
    },

    // handler for mouse scroll events
    // Switches workspace by scrolling over the dock
    // This comes from desktop-scroller@obsidien.github.com
    _onScrollEvent: function (actor, event) {
        if (event.get_scroll_direction() == Clutter.ScrollDirection.UP) {
            Main.wm.actionMoveWorkspaceUp();
        } else if (event.get_scroll_direction() == Clutter.ScrollDirection.DOWN) {
            Main.wm.actionMoveWorkspaceDown();
        }
        return true;
    },

    // autohide function to show dock
    _show: function() {
        let anim = this._animStatus;
        if (_DEBUG_) global.log("dockedWorkspaces: _show autohideStatus = "+this._autohideStatus+" anim.hidden = "+anim.hidden()+" anim.hiding = "+anim.hiding());
        
        if (this._autohideStatus && (anim.hidden() || anim.hiding())) {
            let delay;
            // If the dock is hidden, wait SHOW_DELAY before showing it; 
            // otherwise show it immediately.
            if (anim.hidden()) {
                delay = SHOW_DELAY;
            } else if (anim.hiding()) {
                // suppress all potential queued hiding animations (always give priority to show)
                this._removeAnimations();
                delay = 0;
            }

            this._animateIn(ANIMATION_TIME, delay);

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
                    delay = HIDE_DELAY + 2 * ANIMATION_TIME + SHOW_DELAY;
                } else {
                    this._removeAnimations();
                    delay = 0;
                }
            } else if (anim.shown()) {
                delay = HIDE_DELAY;
            }

            this._animateOut(ANIMATION_TIME, delay);

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
        let final_position = this._monitor.x + this._monitor.width - 1;
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
                    if (_DEBUG_) global.log("dockedWorkspaces: _animateOut onComplete");
                })
            });
        } else {
			// Still need to trigger animStatus states so that show/hide dock functions work properly
			if (_DEBUG_) global.log("dockedWorkspaces: _animateIn final_position == actor.x .. trigger animStatus");
            this._animStatus.queue(false);
			this._animStatus.end();
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
        Tweener.removeTweens(this._backgroundBox);
        Tweener.addTween(this._backgroundBox, {
            opacity: 0,
            time: time,
            delay: delay,
            transition: 'easeOutQuad'
        });
    },

    // autohide function to fade in opaque background
    _fadeInBackground: function(time, delay) {
        if (_DEBUG_) global.log("dockedWorkspaces: _fadeInBackground");
        Tweener.removeTweens(this._backgroundBox);
        Tweener.addTween(this._backgroundBox, {
            opacity: 255,
            time: time,
            delay: delay,
            transition: 'easeOutQuad'
        });
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

    // update background opacity based on preferences
    _updateBackgroundOpacity: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _updateBackgroundOpacity");
        if (OPAQUE_BACKGROUND && (this._autohideStatus || OPAQUE_BACKGROUND_ALWAYS)) {
            this._backgroundBox.show();
            this._fadeInBackground(ANIMATION_TIME, 0);
        } else if (!OPAQUE_BACKGROUND || (!this._autohideStatus && !OPAQUE_BACKGROUND_ALWAYS)) {
            this._fadeOutBackground(ANIMATION_TIME, 0);
        }
    },

    // resdiplay dock called if size-position changed due to dock resizing
    _redisplay: function() {
		if (this._disableRedisplay)
            return
            
        if (_DEBUG_) global.log("dockedWorkspaces: _redisplay");

        // Initial display of dock .. sets autohideStatus
        if (this._autohideStatus == null) {
            if (DOCK_FIXED) {
                this._autohideStatus = true;
                this.fadeInDock(ANIMATION_TIME, 0);
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
                this._animateIn(ANIMATION_TIME, 0);
                this._autohideStatus = false;
            }
        }

        this._updateBackgroundOpacity();
        this._updateClip();
    },

    // update the dock size
    _updateSize: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _updateSize");
        let x = this._monitor.x + this._monitor.width - this._thumbnailsBox.actor.width - 1;
        let x2 = this._monitor.x + this._monitor.width - 1;
        let y = this._monitor.y + Main.overview._viewSelector.actor.y + Main.overview._viewSelector._pageArea.y;
        
        let height = Main.overview._viewSelector._pageArea.height - HEIGHT_SUBTRACT;
        
        // Updating size also resets the position of the staticBox (used to detect window overlaps)
        this.staticBox.x1 = x;
        this.staticBox.y1 = y;
        this.staticBox.x2 = x + this._thumbnailsBox.actor.width + 1;
        this.staticBox.y2 = y + height;
        
        // Updating size shouldn't reset the x position of the actor box (used to detect hover)
        // especially if it's in the hidden slid out position
        this.actor.y = y;
        this.actor.set_size(this._thumbnailsBox.actor.width + 1, height);

        this._thumbnailsBox.actor.set_position(1, 0); // position inside actor
        this._thumbnailsBox.actor.height = height;

        this._backgroundBox.set_position(1, 1); // position inside actor
        this._backgroundBox.set_size(this._thumbnailsBox.actor.width, height - 2);
    },
    
    // 'Hard' reset dock positon: called on start and when monitor changes
    _resetPosition: function() {
        if (_DEBUG_) global.log("dockedWorkspaces: _resetPosition");
        this._monitor = Main.layoutManager.primaryMonitor;
        this._updateSize();

        let x = this._monitor.x + this._monitor.width - this._thumbnailsBox.actor.width - 1;
        let x2 = this._monitor.x + this._monitor.width - 1;
        let y = this._monitor.y + Main.overview._viewSelector.actor.y + Main.overview._viewSelector._pageArea.y;
        
        if (DOCK_FIXED) {
            //position on the screen (right side) so that its initial show is not animated
            this.actor.set_position(x, y);
        } else {
            //position out of the screen (right side) so that its initial show is animated
            this.actor.set_position(x2, y);
        }

		this._updateBackgroundOpacity();
        this._updateClip();
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
            this._animateIn(ANIMATION_TIME, 0);                

            if (OPAQUE_BACKGROUND && !OPAQUE_BACKGROUND_ALWAYS)
                this._fadeOutBackground(ANIMATION_TIME, 0);

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

            if (!this.actor.hover || !AUTOHIDE) {
                if (_DEBUG_) global.log("dockedWorkspaces: enableAutoHide - mouse not hovering OR dock not using autohide, so animate out");
                this._animateOut(ANIMATION_TIME, 0);
                delay = ANIMATION_TIME;
            } else {
                if (_DEBUG_) global.log("dockedWorkspaces: enableAutoHide - mouse hovering AND dock using autohide, so startWorkspacesShowLoop instead of animate out");
                // I'm enabling autohide and the workspaces keeps being showed because of mouse hover
                // so i start the loop usualy started by _show()
                this._startWorkspacesShowLoop();

                delay = 0;
            }

            if (OPAQUE_BACKGROUND && !OPAQUE_BACKGROUND_ALWAYS) {
                this._fadeInBackground(ANIMATION_TIME, delay);
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
