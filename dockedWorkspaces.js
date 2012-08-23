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

const Main = imports.ui.main;
const WorkspacesView = imports.ui.workspacesView;
const Workspace = imports.ui.workspace;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;
const Overview = imports.ui.overview;
const Tweener = imports.ui.tweener;
const WorkspaceSwitcherPopup = imports.ui.workspaceSwitcherPopup;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const MyThumbnailsBox = Me.imports.myThumbnailsBox;

function dockedWorkspaces(settings) {
    this._init(settings);
}

dockedWorkspaces.prototype = {

    _init: function(settings) {

        // Load settings
        this._settings = settings;
        this._bindSettingsChanges();

        this._signalHandler = new Convenience.globalSignalHandler();

        // Timeout id used to ensure the workspaces is hidden after some menu is shown
        this._workspacesShowTimeout = 0;

        // authohide current status. Not to be confused with autohide enable/disagle global (g)settings
        this._autohideStatus = this._settings.get_boolean('autohide') && !this._settings.get_boolean('dock-fixed');

        // initialize animation status object
        this._animStatus = new animationStatus(true);

        // Force normal workspaces to be always zoomed
        // TODO: need to find another way of doing this.  The present approach
        // overrides the WorkspacesDisplay updateAlwaysZoom function
        let p = WorkspacesView.WorkspacesDisplay.prototype;
        this.saved_updateAlwaysZoom = p._updateAlwaysZoom;
        p._updateAlwaysZoom = function() {
            this._alwaysZoomOut = true;
        };
        Main.overview._workspacesDisplay._alwaysZoomOut = true;

        // Hide the normal workspaces thumbnailsBox
        Main.overview._workspacesDisplay._thumbnailsBox.actor.hide();

        // Create a new thumbnailsbox object
        this._thumbnailsBox = new MyThumbnailsBox.myThumbnailsBox();
        this._thumbnailsBox.show();
		
        // Create the main container, turn on track hover, add hoverChange signal
        this.actor = new St.BoxLayout({
            name: 'workspacestodockContainer',
            reactive: true,
            track_hover: true
        });
        this.actor.connect("notify::hover", Lang.bind(this, this._hoverChanged));
        this.actor.connect("scroll-event", Lang.bind(this, this._onScrollEvent));

        // Sometimes Main.wm._workspaceSwitcherPopup is null when first loading the 
        // extension causing scroll-event problems
        if (Main.wm._workspaceSwitcherPopup == null)
            Main.wm._workspaceSwitcherPopup = new WorkspaceSwitcherPopup.WorkspaceSwitcherPopup();

        // Create the background box and set opacity
        this._backgroundBox = new St.Bin({
            name: 'workspacestodockBackground',
            reactive: false,
            y_align: St.Align.START,
            style_class: 'workspace-thumbnails-background'
        });
        this._backgroundBox.set_style('background-color: rgba(1,1,1,' + this._settings.get_double('background-opacity') + ')');

        // Create the staticbox that stores the size and position where the dock is shown
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
                Main.overview._viewSelector._pageArea,
                'notify::y',
                Lang.bind(this, this._updateYPosition)
            ],
            [
                Main.overview._viewSelector,
                'notify::y',
                Lang.bind(this, this._updateYPosition)
            ],
            [
                Main.overview._viewSelector._pageArea,
                'notify::height',
                Lang.bind(this, this._updateHeight)
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
            ]
        );

        //Hide the dock whilst setting positions
        //this.actor.hide(); but I need to access its width, so I use opacity
        this.actor.set_opacity(0);

        // Add workspaces and backgroundBox to the main container actor and then to the Chrome.
        this.actor.add_actor(this._backgroundBox);
        this.actor.add_actor(this._thumbnailsBox.actor);
        Main.layoutManager.addChrome(this.actor, {
            affectsStruts: this._settings.get_boolean('dock-fixed')
        });

        // Start main loop and bind initialize function
        Mainloop.idle_add(Lang.bind(this, this._initialize));
    },

    _initialize: function() {
        /* This is a workaround I found to get correct size and positions of actor
         * inside the overview
        */
        Main.overview._group.show();
        Main.overview._group.hide();

        // Set initial position
        this._resetPosition();

        //put out of the screen (right side) so that its initial show is animated
        this.actor.x = this._monitor.x + this._monitor.width - 1;

        // Show 
        this.actor.set_opacity(255);
        this._redisplay();
    },

    destroy: function() {
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

        // Restore normal workspaces to previous zoom setting
        let p = WorkspacesView.WorkspacesDisplay.prototype;
        p._updateAlwaysZoom = this.saved_updateAlwaysZoom;
        Main.overview._workspacesDisplay._alwaysZoomOut = false;
        Main.overview._workspacesDisplay._updateAlwaysZoom();

        // Reshow normal workspaces thumbnailsBox previously hidden
        Main.overview._workspacesDisplay._thumbnailsBox.actor.show();
    },

    _workspacesRestacked: function() {
        let stack = global.get_window_actors();
        let stackIndices = {};
        for (let i = 0; i < stack.length; i++) {
            // Use the stable sequence for an integer to use as a hash key
            stackIndices[stack[i].get_meta_window().get_stable_sequence()] = i;
        }
        this._thumbnailsBox.syncStacking(stackIndices);
    },

    _workspacesAdded: function() {
        let NumMyWorkspaces = this._thumbnailsBox._thumbnails.length;
        let NumGlobalWorkspaces = global.screen.n_workspaces;
        let active = global.screen.get_active_workspace_index();
        
        if (NumMyWorkspaces == NumGlobalWorkspaces)
            return;

        if (NumGlobalWorkspaces > NumMyWorkspaces) {
            this._thumbnailsBox.addThumbnails(NumMyWorkspaces, NumGlobalWorkspaces - NumMyWorkspaces);
        }
        this._redisplay();
    },

    _workspacesRemoved: function() {
        let NumMyWorkspaces = this._thumbnailsBox._thumbnails.length;
        let NumGlobalWorkspaces = global.screen.n_workspaces;
        let active = global.screen.get_active_workspace_index();
        
        if (NumMyWorkspaces == NumGlobalWorkspaces)
            return;

        if (NumGlobalWorkspaces < NumMyWorkspaces) {
            this._thumbnailsBox.removeThumbmails(0, NumMyWorkspaces);
            this._thumbnailsBox.addThumbnails(0, NumGlobalWorkspaces);
        }
        this._redisplay();
    },

    _bindSettingsChanges: function() {
        this._settings.connect('changed::opaque-background', Lang.bind(this, function() {
            this._updateBackgroundOpacity();
        }));

        this._settings.connect('changed::background-opacity', Lang.bind(this, function() {
            this._backgroundBox.set_style('background-color: rgba(1,1,1,' + this._settings.get_double('background-opacity') + ');padding:0;margin:0;border:0;');
        }));

        this._settings.connect('changed::opaque-background-always', Lang.bind(this, function() {
            this._updateBackgroundOpacity();
        }));

        this._settings.connect('changed::dock-fixed', Lang.bind(this, function() {
            Main.layoutManager.removeChrome(this.actor);
            Main.layoutManager.addChrome(this.actor, {
                affectsStruts: this._settings.get_boolean('dock-fixed')
            });

            if (this._settings.get_boolean('dock-fixed')) {
                // show dock
                this._autohideStatus = true; // It could be false but the dock could be hidden
                this.disableAutoHide();
            } else {
                this.emit('box-changed');
            }
        }));

        this._settings.connect('changed::autohide', Lang.bind(this, function() {
            this._autohideStatus = this._settings.get_boolean('autohide');
            this.emit('box-changed');
        }));
    },

    _hoverChanged: function() {
        //Skip if dock is not in autohide mode for instance because it is shown by intellihide
        if (this._settings.get_boolean('autohide') && this._autohideStatus) {
            if (this.actor.hover) {
                this._show();
            } else {
                this._hide();
            }
        }
    },

    // Switch workspace by scrolling over the dock
    // This comes from desktop-scroller@obsidien.github.com
    _onScrollEvent: function(actor, event) {
        switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
                Main.wm.actionMoveWorkspaceUp();
                break;
            case Clutter.ScrollDirection.DOWN:
                Main.wm.actionMoveWorkspaceDown();
                break;
        }
        return true;
    },

    _show: function() {
        let anim = this._animStatus;

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

    _hide: function() {
        let anim = this._animStatus;

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

    _animateIn: function(time, delay) {
        let final_position = this.staticBox.x1;

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
                }),
                onOverwrite: Lang.bind(this, function() {
                    this._animStatus.clear();
                }),
                onComplete: Lang.bind(this, function() {
                    this._animStatus.end();
                })
            });
        }
    },

    _animateOut: function(time, delay) {
        let final_position = this.staticBox.x1 + this.actor.width - 1;

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
                }),
                onOverwrite: Lang.bind(this, function() {
                    this._animStatus.clear();
                }),
                onComplete: Lang.bind(this, function() {
                    this._animStatus.end();
                })
            });
        }
    },

    _removeAnimations: function() {
        Tweener.removeTweens(this.actor);
        this._animStatus.clearAll();
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

    _fadeOutBackground: function(time, delay) {
        Tweener.removeTweens(this._backgroundBox);
        Tweener.addTween(this._backgroundBox, {
            opacity: 0,
            time: time,
            delay: delay,
            transition: 'easeOutQuad'
        });
    },

    _fadeInBackground: function(time, delay) {
        Tweener.removeTweens(this._backgroundBox);
        Tweener.addTween(this._backgroundBox, {
            opacity: 255,
            time: time,
            delay: delay,
            transition: 'easeOutQuad'
        });
    },

    _updateBackgroundOpacity: function() {
        if (this._settings.get_boolean('opaque-background') && (this._autohideStatus || this._settings.get_boolean('opaque-background-always'))) {
            this._backgroundBox.show();
            this._fadeInBackground(this._settings.get_double('animation-time'), 0);
        } else if (!this._settings.get_boolean('opaque-background') || (!this._autohideStatus && !this._settings.get_boolean('opaque-background-always'))) {
            this._fadeOutBackground(this._settings.get_double('animation-time'), 0);
        }
    },

    _redisplay: function() {
        this._updateStaticBox();

        // Update workspaces x position animating it
        if (this._animStatus.hidden()) {
            this._removeAnimations();
            this._animateOut(0, 0);
        } else if (this._animStatus.shown()) {
            this._removeAnimations();
            this._animateIn(this._settings.get_double('animation-time'), 0);
        }

        this._updateBackgroundOpacity();
        this._updateClip();
    },

    _updateYPosition: function() {
        this._updateStaticBox();
        this.actor.y = this.staticBox.y1;
    },

    _updateHeight: function() {
        this._updateStaticBox();
        this.actor.height = this.staticBox.y2 - this.staticBox.y1;
        this._thumbnailsBox.actor.height = this.staticBox.y2 - this.staticBox.y1;
        this._backgroundBox.height = this.staticBox.y2 - this.staticBox.y1 - 2;
    },

    _updateStaticBox: function() {
        this.staticBox.init_rect(
            this._monitor.x + this._monitor.width - this._thumbnailsBox.actor.width - 1,
            this._monitor.y + Main.overview._viewSelector.actor.y + Main.overview._viewSelector._pageArea.y,
            this._thumbnailsBox.actor.width + 1, //thumbnailsBox.actor.width is used to set staticBox.width
            Main.overview._viewSelector._pageArea.height
        );
        this.emit('box-changed');
    },

    // 'Hard' reset dock positon: called on start and when monitor changes
    _resetPosition: function() {
        this._monitor = Main.layoutManager.primaryMonitor;
        this._updateStaticBox();

        this._thumbnailsBox.actor.set_position(1, 0);
        this._thumbnailsBox.actor.height = this.staticBox.y2 - this.staticBox.y1;

        this.actor.set_position(this.staticBox.x1, this.staticBox.y1);
        this.actor.set_size(this.staticBox.x2 - this.staticBox.x1, this.staticBox.y2 - this.staticBox.y1);

        this._backgroundBox.set_position(1, 1);
        this._backgroundBox.set_size(this.staticBox.x2 - this.staticBox.x1, this.staticBox.y2 - this.staticBox.y1 - 2);

        this._updateClip();
    },

    // Start a loop to hide the workspaces.
    _startWorkspacesShowLoop: function() {
        // If a loop already exists clear it
        if (this._workspacesShowTimeout > 0)
            Mainloop.source_remove(this._workspacesShowTimeout);

        this._workspacesShowTimeout = Mainloop.timeout_add(500, Lang.bind(this, function() {
            // I'm not sure why but I need not to sync hover if it results already false
            if (this.actor.hover == true) {
                this.actor.sync_hover();
            }
            return true; // to make the loop continue;
        }));
    },

    // Disable autohide effect, thus show workspaces
    disableAutoHide: function() {
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
        if (this._autohideStatus == false) {

            let delay = 0; // immediately fadein background if hide is blocked by mouseover, otherwise start fadein when dock is already hidden.

            this._autohideStatus = true;
            this._removeAnimations();

            if (this.actor.hover == true) {
                this.actor.sync_hover();
            }

            if (!this.actor.hover || !this._settings.get_boolean('autohide')) {
                this._animateOut(this._settings.get_double('animation-time'), 0);
                delay = this._settings.get_double('animation-time');
            } else if (this._settings.get_boolean('autohide')) {
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
