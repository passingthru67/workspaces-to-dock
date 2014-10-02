/* ========================================================================================================
 * myThumbnailsBox.js - thumbnailsbox object
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  Part of this code was copied from the gnome-shell-extensions framework
 *  http://git.gnome.org/browse/gnome-shell-extensions/
 * ========================================================================================================
 */

const _DEBUG_ = false;

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Signals = imports.signals;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const DND = imports.ui.dnd;

const Main = imports.ui.main;
const WorkspacesView = imports.ui.workspacesView;
const Workspace = imports.ui.workspace;
const WorkspaceThumbnail = imports.ui.workspaceThumbnail;
const Overview = imports.ui.overview;
const Tweener = imports.ui.tweener;
const Config = imports.misc.config;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const ThumbnailCaption = Me.imports.thumbnailCaption;
const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

// The maximum size of a thumbnail is 1/8 the width and height of the screen
let MAX_THUMBNAIL_SCALE = 1/8.;

const OVERRIDE_SCHEMA = 'org.gnome.shell.overrides';

const ThumbnailState = {
    NEW: 0,
    ANIMATING_IN: 1,
    NORMAL: 2,
    REMOVING: 3,
    ANIMATING_OUT: 4,
    ANIMATED_OUT: 5,
    COLLAPSING: 6,
    DESTROYED: 7
};

const myWindowClone = new Lang.Class({
    Name: 'workspacesToDock.myWindowClone',
    Extends: WorkspaceThumbnail.WindowClone,

    _init : function(realWindow) {
        this._mySettings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        // passingthru67: Using the realWindow caused a bug where the parent window disappeared
        // We've gone back to using the realWindow's texture as was used in Gnome 3.10
        this.clone = new Clutter.Clone({ source: realWindow.get_texture() });

        /* Can't use a Shell.GenericContainer because of DND and reparenting... */
        this.actor = new Clutter.Actor({ layout_manager: new WorkspaceThumbnail.PrimaryActorLayout(this.clone),
                                         reactive: true });
        this.actor._delegate = this;
        this.actor.add_child(this.clone);
        this.realWindow = realWindow;
        this.metaWindow = realWindow.meta_window;

        this.clone._updateId = this.metaWindow.connect('position-changed',
                                                       Lang.bind(this, this._onPositionChanged));
        this.clone._destroyId = this.realWindow.connect('destroy', Lang.bind(this, function() {
            // First destroy the clone and then destroy everything
            // This will ensure that we never see it in the _disconnectSignals loop
            this.clone.destroy();
            this.destroy();
        }));
        this._onPositionChanged();

        this.actor.connect('button-release-event',
                           Lang.bind(this, this._onButtonRelease));

        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        this._draggable = DND.makeDraggable(this.actor,
                                            { restoreOnSuccess: true,
                                              dragActorMaxSize: Workspace.WINDOW_DND_SIZE,
                                              dragActorOpacity: Workspace.DRAGGING_WINDOW_OPACITY });
        this._draggable.connect('drag-begin', Lang.bind(this, this._onDragBegin));
        this._draggable.connect('drag-cancelled', Lang.bind(this, this._onDragCancelled));
        this._draggable.connect('drag-end', Lang.bind(this, this._onDragEnd));
        this.inDrag = false;

        let iter = Lang.bind(this, function(win) {
            let actor = win.get_compositor_private();

            if (!actor)
                return false;
            if (!win.is_attached_dialog())
                return false;

            this._doAddAttachedDialog(win, actor);
            win.foreach_transient(iter);

            return true;
        });
        this.metaWindow.foreach_transient(iter);
    },

    _onPositionChanged: function() {
        // passingthru67: Don't know why but windows that use Client Side Decorations (like gEdit)
        // don't position properly when maximized or in fullscreen mode. Is it an upstream bug?
        let rect = this.metaWindow.get_outer_rect();
        if (_DEBUG_) global.log("window clone position changed - x="+this.realWindow.x+" y="+this.realWindow.y+" nx="+rect.x+" ny="+rect.y);
        this.actor.set_position(this.realWindow.x, this.realWindow.y);
        if (this.metaWindow.get_maximized() && rect) {
            this.actor.set_position(rect.x, rect.y);
        } else {
            this.actor.set_position(this.realWindow.x, this.realWindow.y);
        }
    },

    _disconnectSignals: function() {
        let self = this;
        // passingthru67: We can't use the clone's source on the parent window because
        // we've reverted to using the realWindow texture that fixed the bug where the
        // parent window disappeared (see _init above).
        this.actor.get_children().forEach(function(child) {
            let realWindow;
            if (child == self.clone) {
                realWindow = self.realWindow;
            } else {
                realWindow = child.source;
            }

            realWindow.meta_window.disconnect(child._updateId);
            realWindow.disconnect(child._destroyId);
        });
    },

    _onButtonRelease : function (actor, event) {
        if (this._mySettings.get_boolean('toggle-overview')) {
            let button = event.get_button();
            if (button == 3) {
                // pass right-click event on allowing it to bubble up to thumbnailsBox
                return Clutter.EVENT_PROPAGATE;
            }
        }
        this.emit('selected', event.get_time());
        return Clutter.EVENT_STOP;
    }
});

const myWorkspaceThumbnail = new Lang.Class({
    Name: 'workspacesToDock.myWorkspaceThumbnail',
    Extends: WorkspaceThumbnail.WorkspaceThumbnail,

    _init: function(metaWorkspace, thumbnailsBox) {
        this._windowsOnAllWorkspaces = [];
        this.parent(metaWorkspace);

        this._thumbnailsBox = thumbnailsBox;
        this.caption = new ThumbnailCaption.ThumbnailCaption(this);
    },

    refreshWindowClones: function() {
        if (_DEBUG_ && !this._removed) global.log("myWorkspaceThumbnail: refreshWindowClones for metaWorkspace "+this.metaWorkspace.index());
        // Disconnect window signals
        for (let i = 0; i < this._allWindows.length; i++) {
            this._allWindows[i].disconnect(this._minimizedChangedIds[i]);
        }
        // Destroy window clones
        for (let i = 0; i < this._windows.length; i++) {
            this._windows[i].destroy();
        }
        // Create clones for windows that should be visible in the Overview
        this._windows = [];
        this._allWindows = [];
        this._minimizedChangedIds = [];
        let windows = global.get_window_actors().filter(Lang.bind(this, function(actor) {
            let win = actor.meta_window;
            return win.located_on_workspace(this.metaWorkspace);
        }));
        for (let i = 0; i < windows.length; i++) {
            let minimizedChangedId =
                windows[i].meta_window.connect('notify::minimized',
                                               Lang.bind(this,
                                                         this._updateMinimized));
            this._allWindows.push(windows[i].meta_window);
            this._minimizedChangedIds.push(minimizedChangedId);

            if (this._isMyWindow(windows[i]) && this._isOverviewWindow(windows[i])) {
                this._addWindowClone(windows[i]);
            }
        }
    },

    _doRemoveWindow : function(metaWin) {
        if (_DEBUG_ && !this._removed) global.log("myWorkspaceThumbnail: _doRemoveWindow for metaWorkspace "+this.metaWorkspace.index());
        let win = metaWin.get_compositor_private();

        // find the position of the window in our list
        let index = this._lookupIndex (metaWin);

        if (index == -1)
            return;

        let clone = this._windows[index];
        this._windows.splice(index, 1);

        // passingthru67 - refresh thumbnails if metaWin being removed is on all workspaces
        //if (win && this._isMyWindow(win) && metaWin.is_on_all_workspaces()) {
        if (win && metaWin.is_on_all_workspaces()) {
            for (let j = 0; j < this._windowsOnAllWorkspaces.length; j++) {
                if (metaWin == this._windowsOnAllWorkspaces[j]) {
                    this._windowsOnAllWorkspaces.splice(j, 1);
                }
            }
            this._thumbnailsBox.refreshThumbnails();
        }

        clone.destroy();
    },

    _doAddWindow : function(metaWin) {
        if (_DEBUG_ && !this._removed) global.log("myWorkspaceThumbnail: _doAddWindow for metaWorkspace "+this.metaWorkspace.index());
        if (this._removed)
            return;

        let win = metaWin.get_compositor_private();

        if (!win) {
            // Newly-created windows are added to a workspace before
            // the compositor finds out about them...
            let id = Mainloop.idle_add(Lang.bind(this,
                                       function () {
                                            if (!this._removed &&
                                                metaWin.get_compositor_private() &&
                                                metaWin.get_workspace() == this.metaWorkspace)
                                                this._doAddWindow(metaWin);
                                            return GLib.SOURCE_REMOVE;
                                        }));
            GLib.Source.set_name_by_id(id, '[gnome-shell] this._doAddWindow');
            return;
        }

        if (this._allWindows.indexOf(metaWin) == -1) {
            let minimizedChangedId = metaWin.connect('notify::minimized',
                                                     Lang.bind(this,
                                                               this._updateMinimized));
            this._allWindows.push(metaWin);
            this._minimizedChangedIds.push(minimizedChangedId);
        }

        // We might have the window in our list already if it was on all workspaces and
        // now was moved to this workspace
        if (this._lookupIndex (metaWin) != -1)
            return;

        if (!this._isMyWindow(win))
            return;

        if (this._isOverviewWindow(win)) {
            // passingthru67 - force thumbnail refresh if window is on all workspaces
            // note: _addWindowClone checks if metawindow is on all workspaces
            this._addWindowClone(win, true);
        } else if (metaWin.is_attached_dialog()) {
            let parent = metaWin.get_transient_for();

            // passingthru67 - BUG FIX for attachdialog issue causing gnome shell to crash
            // The fix was to replace metaWin with parent in the while loop.
            //while (parent.is_attached_dialog())
                //parent = metaWin.get_transient_for();
            while (parent.is_attached_dialog())
                parent = parent.get_transient_for();

            let idx = this._lookupIndex (parent);
            if (idx < 0) {
                // parent was not created yet, it will take care
                // of the dialog when created
                return;
            }

            let clone = this._windows[idx];
            clone.addAttachedDialog(metaWin);
        }
    },

    workspaceRemoved: function() {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: workspaceRemoved");
        this.caption.workspaceRemoved();
        this.parent();
    },

    _onDestroy: function(actor) {
        if (_DEBUG_) global.log("myWorkspaceThumbnail: _onDestroy");
        this.caption.destroy();
        this.parent(actor);
    },

    // Create a clone of a (non-desktop) window and add it to the window list
    _addWindowClone : function(win, refresh) {
        if (_DEBUG_ && !this._removed) global.log("myWorkspaceThumbnail: _addWindowClone for metaWorkspace "+this.metaWorkspace.index());
        let clone = new myWindowClone(win);

        clone.connect('selected',
                      Lang.bind(this, function(clone, time) {
                          this.activate(time);
                      }));
        clone.connect('drag-begin',
                      Lang.bind(this, function() {
                          Main.overview.beginWindowDrag(clone.metaWindow);
                      }));
        clone.connect('drag-cancelled',
                      Lang.bind(this, function() {
                          Main.overview.cancelledWindowDrag(clone.metaWindow);
                      }));
        clone.connect('drag-end',
                      Lang.bind(this, function() {
                          Main.overview.endWindowDrag(clone.metaWindow);
                      }));
        this._contents.add_actor(clone.actor);

        if (this._windows.length == 0)
            clone.setStackAbove(this._bgManager.backgroundActor);
        else
            clone.setStackAbove(this._windows[this._windows.length - 1].actor);

        this._windows.push(clone);

        // passingthru67 - need to refresh thumbnails if new added window is on all workspaces
        // NOTE: refresh is only forced when a new window is added and not during myWorkspaceThumbnail initialization
        if (clone.metaWindow.is_on_all_workspaces()) {
            let alreadyPushed = false;
            for (let j = 0; j < this._windowsOnAllWorkspaces.length; j++) {
                if (clone.metaWindow == this._windowsOnAllWorkspaces[j]) {
                    alreadyPushed = true;
                }
            }
            if (!alreadyPushed) {
                this._windowsOnAllWorkspaces.push(clone.metaWindow);
            }
            if (refresh) {
                this._thumbnailsBox.refreshThumbnails();
            }
        }

        return clone;
    },

    setWindowClonesReactiveState: function (state) {
        if (state == null)
            return;

        for (let i = 0; i < this._windows.length; i++) {
            let clone = this._windows[i];
            clone.actor.reactive = state;
        }
    }

});

const myThumbnailsBox = new Lang.Class({
    Name: 'workspacesToDock.myThumbnailsBox',
    Extends: WorkspaceThumbnail.ThumbnailsBox,

    _init: function(dock) {
        this._dock = dock;
        this._gsCurrentVersion = Config.PACKAGE_VERSION.split('.');
        this._mySettings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');

        // override _init to remove create/destroy thumbnails when showing/hiding overview
        this.actor = new Shell.GenericContainer({ reactive: true,
                                                  style_class: 'workspace-thumbnails',
                                                  request_mode: Clutter.RequestMode.WIDTH_FOR_HEIGHT });
        this.actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
        this.actor.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
        this.actor.connect('allocate', Lang.bind(this, this._allocate));
        this.actor._delegate = this;

        // Add addtional style class when workspace is fixed and set to full height
        if (this._mySettings.get_boolean('dock-fixed') && this._mySettings.get_boolean('extend-height') && this._mySettings.get_double('top-margin') == 0) {
            this.actor.add_style_class_name('workspace-thumbnails-fullheight');
        }

        let indicator = new St.Bin({ style_class: 'workspace-thumbnail-indicator' });

        // We don't want the indicator to affect drag-and-drop
        Shell.util_set_hidden_from_pick(indicator, true);

        this._indicator = indicator;
        this.actor.add_actor(indicator);

        this._dropWorkspace = -1;
        this._dropPlaceholderPos = -1;
        this._dropPlaceholder = new St.Bin({ style_class: 'placeholder' });
        this.actor.add_actor(this._dropPlaceholder);
        this._spliceIndex = -1;

        this._targetScale = 0;
        this._scale = 0;
        this._pendingScaleUpdate = false;
        this._stateUpdateQueued = false;
        this._animatingIndicator = false;
        this._indicatorY = 0; // only used when _animatingIndicator is true

        this._stateCounts = {};
        for (let key in ThumbnailState)
            this._stateCounts[ThumbnailState[key]] = 0;

        this._thumbnails = [];

        this.actor.connect('button-press-event', function() { return Clutter.EVENT_STOP; });
        this.actor.connect('button-release-event', Lang.bind(this, this._onButtonRelease));
        this.actor.connect('destroy', Lang.bind(this, this._onDestroy));

        // Connect global signals
        this._signalHandler = new Convenience.globalSignalHandler();
        this._signalHandler.push(
            [
                Main.overview,
                'item-drag-begin',
                Lang.bind(this,this._onDragBegin)
            ],
            [
                Main.overview,
                'item-drag-cancelled',
                Lang.bind(this,this._onDragCancelled)
            ],
            [
                Main.overview,
                'item-drag-end',
                Lang.bind(this,this._onDragEnd)
            ],
            [
                Main.overview,
                'window-drag-begin',
                Lang.bind(this,this._onDragBegin)
            ],
            [
                Main.overview,
                'window-drag-cancelled',
                Lang.bind(this,this._onDragCancelled)
            ],
            [
                Main.overview,
                'window-drag-end',
                Lang.bind(this,this._onDragEnd)
            ],
            [
                global.window_manager,
                'maximize',
                Lang.bind(this, this.refreshThumbnails)
            ],
            [
                global.window_manager,
                'unmaximize',
                Lang.bind(this, this.refreshThumbnails)
            ],
            [
                global.screen,
                'in-fullscreen-changed',
                Lang.bind(this, this.refreshThumbnails)
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

        this._settings = new Gio.Settings({ schema_id: OVERRIDE_SCHEMA });
        this._settings.connect('changed::dynamic-workspaces',
            Lang.bind(this, this._updateSwitcherVisibility));
    },

    _onDestroy: function() {
        // Disconnect global signals
        this._signalHandler.disconnect();
    },

    // handler for when workspace is added
    _onWorkspaceAdded: function() {
        // -------------------------------------------------------------------
        // TODO: GS3.14 now checks for valid thumbnails with code below
        // This should fix the issues experienced in the past where the number
        // of thumbnails didn't match the number of global workspaces.
        // let validThumbnails = this._thumbnails.filter(function(t) {
        //     return t.state <= ThumbnailState.NORMAL;
        // });
        // let NumMyWorkspaces = validThumbnails.length;
        // -------------------------------------------------------------------
        let NumMyWorkspaces = this._thumbnails.length;
        let NumGlobalWorkspaces = global.screen.n_workspaces;
        let active = global.screen.get_active_workspace_index();

        // NumMyWorkspaces == NumGlobalWorkspaces shouldn't happen, but does when Firefox started.
        // Assume that a workspace thumbnail is still in process of being removed from _thumbnailsBox
        if (_DEBUG_) global.log("dockedWorkspaces: _workspacesAdded - thumbnail being added  .. ws="+NumGlobalWorkspaces+" th="+NumMyWorkspaces);
        if (NumMyWorkspaces == NumGlobalWorkspaces)
            NumMyWorkspaces --;

        if (NumGlobalWorkspaces > NumMyWorkspaces)
            this.addThumbnails(NumMyWorkspaces, NumGlobalWorkspaces - NumMyWorkspaces);
    },

    // handler for when workspace is removed
    _onWorkspaceRemoved: function() {
        // -------------------------------------------------------------------
        // TODO: GS3.14 now checks for valid thumbnails with code below
        // This should fix the issues experienced in the past where the number
        // of thumbnails didn't match the number of global workspaces.
        // let validThumbnails = this._thumbnails.filter(function(t) {
        //     return t.state <= ThumbnailState.NORMAL;
        // });
        // let NumMyWorkspaces = validThumbnails.length;
        // -------------------------------------------------------------------
        let NumMyWorkspaces = this._thumbnails.length;
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
            if (this._thumbnails[w].metaWorkspace != metaWorkspace) {
                removedIndex = w;
                break;
            }
        }

        if (removedIndex != null) {
            if (_DEBUG_) global.log("dockedWorkspaces: _workspacesRemoved - thumbnail index being removed is = "+removedIndex);
            this.removeThumbnails(removedIndex, removedNum);
        }
    },

    // override _createThumbnails to remove global n-workspaces notification
    _createThumbnails: function() {
        if (_DEBUG_) global.log("mythumbnailsBox: _createThumbnails");
        this._switchWorkspaceNotifyId =
            global.window_manager.connect('switch-workspace',
                                          Lang.bind(this, this._activeWorkspaceChanged));
        //this._nWorkspacesNotifyId =
            //global.screen.connect('notify::n-workspaces',
                                  //Lang.bind(this, this._workspacesChanged));
        this._syncStackingId =
            Main.overview.connect('windows-restacked',
                                  Lang.bind(this, this._syncStacking));

        this._targetScale = 0;
        this._scale = 0;
        this._pendingScaleUpdate = false;
        this._stateUpdateQueued = false;

        this._stateCounts = {};
        for (let key in ThumbnailState)
            this._stateCounts[ThumbnailState[key]] = 0;

        this.addThumbnails(0, global.screen.n_workspaces);

        this._updateSwitcherVisibility();
    },

    refreshThumbnails: function() {
        if (_DEBUG_) global.log("mythumbnailsBox: refreshThumbnails");
        for (let i = 0; i < this._thumbnails.length; i++) {
            this._thumbnails[i].refreshWindowClones();
            this._thumbnails[i].caption.activeWorkspaceChanged();
        }
    },

    // override _onButtonRelease to provide customized click actions (i.e. overview on right click)
    _onButtonRelease: function(actor, event) {
        if (_DEBUG_) global.log("mythumbnailsBox: _onButtonRelease");
        // ThumbnailsBox click events are passed on to dock handler if conditions are met
        // Helpful in cases where the 'dock-edge-visible' option is enabled. It provides more
        // area to click on to show the dock when the window is maximized.

        // Should we continue processing the button release or pass the event on to the dock handler?
        // Continue if 'dock-edge-visible' && 'require-click-to-show' are not enabled
        if (this._mySettings.get_boolean('dock-edge-visible') && this._mySettings.get_boolean('require-click-to-show')) {
            // Continue if window is not maximized (_hovering only true if window is maximized)
            if (this._dock._hovering) {
                // Continue if dock is not in autohide mode for instance because it is shown by intellihide
                if (this._mySettings.get_boolean('autohide') && this._dock._autohideStatus) {
                    if (this._dock.actor.hover) {
                        // Continue if dock is showing or shown
                        if (this._dock._animStatus.hidden() || this._dock._animStatus.hiding()) {
                            // STOP. Lets not continue but pass the click event on to dock handler
                            return Clutter.EVENT_PROPAGATE;
                        }
                    }
                }
            }
        }

        if (this._mySettings.get_boolean('toggle-overview')) {
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

        let [stageX, stageY] = event.get_coords();
        let [r, x, y] = this.actor.transform_stage_point(stageX, stageY);

        for (let i = 0; i < this._thumbnails.length; i++) {
            let thumbnail = this._thumbnails[i]
            let [w, h] = thumbnail.actor.get_transformed_size();
            if (y >= thumbnail.actor.y && y <= thumbnail.actor.y + h) {
                //thumbnail.activate(event.time);
                thumbnail.activate(event.get_time());
                break;
            }
        }
        return Clutter.EVENT_STOP;

    },

    // override addThumbnails to provide workspace thumbnail labels
    addThumbnails: function(start, count) {
        if (_DEBUG_) global.log("mythumbnailsBox: addThumbnails");
        this._ensurePorthole();
        for (let k = start; k < start + count; k++) {
            let metaWorkspace = global.screen.get_workspace_by_index(k);
            let thumbnail = new myWorkspaceThumbnail(metaWorkspace, this);
            thumbnail.setPorthole(this._porthole.x, this._porthole.y,
                                  this._porthole.width, this._porthole.height);

            this._thumbnails.push(thumbnail);
            this.actor.add_actor(thumbnail.actor);

            if (start > 0 && this._spliceIndex == -1) {
                // not the initial fill, and not splicing via DND
                thumbnail.state = ThumbnailState.NEW;
                thumbnail.slidePosition = 1; // start slid out
                this._haveNewThumbnails = true;
            } else {
                thumbnail.state = ThumbnailState.NORMAL;
            }

            this._stateCounts[thumbnail.state]++;
        }

        this._queueUpdateStates();

        // The thumbnails indicator actually needs to be on top of the thumbnails
        this._indicator.raise_top();

        // Clear the splice index, we got the message
        this._spliceIndex = -1;
    },

    updateTaskbars: function(metaWin, action) {
        if (_DEBUG_) global.log("mythumbnailsBox: updateTaskbars");
        for (let i = 0; i < this._thumbnails.length; i++) {
            this._thumbnails[i].caption.updateTaskbar(metaWin, action);
        }
    },

    setPopupMenuFlag: function(showing) {
        if (_DEBUG_) global.log("mythumbnailsBox: setPopupMenuFlag");
        this._dock.setPopupMenuFlag(showing);
    },

    _updateThumbnailCaption: function(thumbnail, i, captionHeight, captionBackgroundHeight) {
        thumbnail.caption.updateCaption(i, captionHeight, captionBackgroundHeight);
    },

    _getPreferredHeight: function(actor, forWidth, alloc) {
        // Note that for getPreferredWidth/Height we cheat a bit and skip propagating
        // the size request to our children because we know how big they are and know
        // that the actors aren't depending on the virtual functions being called.

        this._ensurePorthole();
        let themeNode = this.actor.get_theme_node();

        let spacing = themeNode.get_length('spacing');

        // passingthru67 - make room for thumbnail captions
        let captionBackgroundHeight = 0;
        if (this._mySettings.get_boolean('workspace-captions')) {
            captionBackgroundHeight = this._mySettings.get_double('workspace-caption-height');
        }
        spacing = spacing + captionBackgroundHeight;

        let nWorkspaces = global.screen.n_workspaces;

        // passingthru67 - add 5px to totalSpacing calculation
        // otherwise scale doesn't kick in soon enough and total thumbnails height is greater than height of dock
        // why is 5px needed? spacing was already adjusted in gnome-shell.css from 7px to 27px (GS36 11px to ?)
        // does it have anything to do with a border added by St.Bin in WorkspaceThumbnails _background?
        //let totalSpacing = (nWorkspaces - 1) * spacing;
        let totalSpacing;
        if (this._mySettings.get_boolean('workspace-captions')) {
            totalSpacing = (nWorkspaces - 1) * (spacing + 5);
        } else {
            totalSpacing = (nWorkspaces - 1) * spacing;
        }

        let maxScale;
        if (this._mySettings.get_boolean('customize-thumbnail')) {
            maxScale = this._mySettings.get_double('thumbnail-size');
        } else {
            maxScale = MAX_THUMBNAIL_SCALE;
        }

        alloc.min_size = totalSpacing;
        alloc.natural_size = totalSpacing + nWorkspaces * this._porthole.height * maxScale;
    },

    _getPreferredWidth: function(actor, forHeight, alloc) {
        this._ensurePorthole();

        let themeNode = this.actor.get_theme_node();

        let spacing = this.actor.get_theme_node().get_length('spacing');

        // passingthru67 - make room for thumbnail captions
        let captionBackgroundHeight = 0;
        if (this._mySettings.get_boolean('workspace-captions')) {
            captionBackgroundHeight = this._mySettings.get_double('workspace-caption-height');
        }
        spacing = spacing + captionBackgroundHeight;

        let nWorkspaces = global.screen.n_workspaces;

        // passingthru67 - add 5px to totalSpacing calculation
        // otherwise scale doesn't kick in soon enough and total thumbnails height is greater than height of dock
        // why is 5px needed? spacing was already adjusted in gnome-shell.css from 7px to 27px (GS36 11px to ?)
        // does it have anything to do with a border added by St.Bin in WorkspaceThumbnails _background?
        //let totalSpacing = (nWorkspaces - 1) * spacing;
        let totalSpacing;
        if (this._mySettings.get_boolean('workspace-captions')) {
            totalSpacing = (nWorkspaces - 1) * (spacing + 5);
        } else {
            totalSpacing = (nWorkspaces - 1) * spacing;
        }

        let avail = forHeight - totalSpacing;

        let scale = (avail / nWorkspaces) / this._porthole.height;
        if (this._mySettings.get_boolean('customize-thumbnail')) {
            scale = Math.min(scale, this._mySettings.get_double('thumbnail-size'));
        } else {
            scale = Math.min(scale, MAX_THUMBNAIL_SCALE);
        }

        let width = Math.round(this._porthole.width * scale);
        alloc.min_size = width;
        alloc.natural_size = width;
    },

    _checkWindowsOnAllWorkspaces: function(thumbnail) {
        // passingthru67: This is a hackish way of tracking windows visible on all workspaces
        // TODO: Is there a signal emitted or property set by mutter metawindows that we can connect
        // to determine when a window is set to visible-on-all-workspaces?
        let refresh = false;
        if (_DEBUG_ && thumbnail._windows.length > 0) global.log("myWorkspaceThumbnail: _checkWindowsOnAllWorkspaces - windowsOnAllWorkspaces.length = "+thumbnail._windowsOnAllWorkspaces.length);
        for (let i = 0; i < thumbnail._windows.length; i++) {
            let clone = thumbnail._windows[i];
            let realWindow = clone.realWindow;
            let metaWindow = clone.metaWindow;
            let alreadyPushed = false;
            for (let j = 0; j < thumbnail._windowsOnAllWorkspaces.length; j++) {
                if (metaWindow == thumbnail._windowsOnAllWorkspaces[j]) {
                    alreadyPushed = true;
                    if (!metaWindow.is_on_all_workspaces()) {
                        if (_DEBUG_) global.log("myWorkspaceThumbnail: _checkWindowsOnAllWorkspaces - REFRESH THUMBNAILS - window removed from windowsOnAllWorkspaces");
                        thumbnail._windowsOnAllWorkspaces.splice(j, 1);
                        refresh = true;
                    }
                }
            }
            if (_DEBUG_ && alreadyPushed) global.log("myWorkspaceThumbnail: _checkWindowsOnAllWorkspaces - "+metaWindow.get_wm_class()+" in windowsOnAllWorkspaces. isMyWindow = "+ thumbnail._isMyWindow(realWindow)+", is_on_all_workspaces = "+metaWindow.is_on_all_workspaces());
            if (_DEBUG_ && !alreadyPushed) global.log("myWorkspaceThumbnail: _checkWindowsOnAllWorkspaces - "+metaWindow.get_wm_class()+" not in windowsOnAllWorkspaces. isMyWindow = "+ thumbnail._isMyWindow(realWindow)+", is_on_all_workspaces = "+metaWindow.is_on_all_workspaces());
            if (!alreadyPushed && metaWindow.is_on_all_workspaces()) {
                if (_DEBUG_) global.log("myWorkspaceThumbnail: _checkWindowsOnAllWorkspaces - REFRESH THUMBNAILS - window added to windowsOnAllWorkspaces");
                thumbnail._windowsOnAllWorkspaces.push(metaWindow);
                refresh = true;
            }
        }
        return refresh;
    },

    // override _allocate to provide area for workspaceThumbnail captions
    // also serves to update caption items
    _allocate: function(actor, box, flags) {
        let rtl = (Clutter.get_default_text_direction () == Clutter.TextDirection.RTL);

        if (this._thumbnails.length == 0) // not visible
            return;

        let themeNode = this.actor.get_theme_node();

        let portholeWidth = this._porthole.width;
        let portholeHeight = this._porthole.height;

        let spacing = themeNode.get_length('spacing');

        // passingthru67 - Caption area below thumbnail used to display thumbnail labels
        let captionHeight = 0;
        let captionBackgroundHeight = 0;
        if (this._mySettings.get_boolean('workspace-captions')) {
            captionBackgroundHeight = this._mySettings.get_double('workspace-caption-height');
            let zoomSize = this._mySettings.get_double('workspace-caption-taskbar-icon-size') + ThumbnailCaption.CAPTION_APP_ICON_ZOOM;
            captionHeight = Math.max(captionBackgroundHeight+4, zoomSize+4);
            // NOTE: +4 needed for padding
            // This value should actually be gotten from the theme node get_padding
        }

        spacing = spacing + captionBackgroundHeight;

        // Compute the scale we'll need once everything is updated
        let nWorkspaces = global.screen.n_workspaces;

        // passingthru67 - add 5px to totalSpacing calculation
        // otherwise newScale doesn't kick in soon enough and total thumbnails height is greater than height of dock
        // why is 5px needed? spacing was already adjusted in gnome-shell.css from 7px to 27px (GS36 11px to ?)
        // does it have anything to do with a border added by St.Bin in WorkspaceThumbnails _background?
        //let totalSpacing = (nWorkspaces - 1) * spacing;
        let totalSpacing;
        if (this._mySettings.get_boolean('workspace-captions')) {
            totalSpacing = (nWorkspaces - 1) * (spacing + 5);
        } else {
            totalSpacing = (nWorkspaces - 1) * spacing;
        }

        let avail = (box.y2 - box.y1) - totalSpacing;

        let newScale = (avail / nWorkspaces) / portholeHeight;
        if (this._mySettings.get_boolean('customize-thumbnail')) {
            newScale = Math.min(newScale, this._mySettings.get_double('thumbnail-size'));
        } else {
            newScale = Math.min(newScale, MAX_THUMBNAIL_SCALE);
        }
        if (_DEBUG_) global.log("mythumbnailsBox: _allocate - newScale = "+newScale+" targetScale = "+this._targetScale);
        if (newScale != this._targetScale) {
            if (this._targetScale > 0) {
                // We don't do the tween immediately because we need to observe the ordering
                // in queueUpdateStates - if workspaces have been removed we need to slide them
                // out as the first thing.
                this._targetScale = newScale;
                this._pendingScaleUpdate = true;
            } else {
                this._targetScale = this._scale = newScale;
            }

            this._queueUpdateStates();
        }

        let thumbnailHeight = portholeHeight * this._scale;
        let thumbnailWidth = Math.round(portholeWidth * this._scale);
        let roundedHScale = thumbnailWidth / portholeWidth;
        if (_DEBUG_) global.log("mythumbnailsBox: _allocate - thumbnailH = "+thumbnailHeight+" thumbnailW = "+thumbnailWidth);

        let slideOffset; // X offset when thumbnail is fully slid offscreen
        if (rtl)
            slideOffset = - (thumbnailWidth + themeNode.get_padding(St.Side.LEFT));
        else
            slideOffset = thumbnailWidth + themeNode.get_padding(St.Side.RIGHT);

        let indicatorY1 = this._indicatorY;
        let indicatorY2;
        // when not animating, the workspace position overrides this._indicatorY
        let indicatorWorkspace = !this._animatingIndicator ? global.screen.get_active_workspace() : null;
        let indicatorThemeNode = this._indicator.get_theme_node();

        let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
        let indicatorBottomFullBorder = indicatorThemeNode.get_padding(St.Side.BOTTOM) + indicatorThemeNode.get_border_width(St.Side.BOTTOM);
        let indicatorLeftFullBorder = indicatorThemeNode.get_padding(St.Side.LEFT) + indicatorThemeNode.get_border_width(St.Side.LEFT);
        let indicatorRightFullBorder = indicatorThemeNode.get_padding(St.Side.RIGHT) + indicatorThemeNode.get_border_width(St.Side.RIGHT);

        let y = box.y1;

        if (this._dropPlaceholderPos == -1) {
            Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                this._dropPlaceholder.hide();
            }));
        }

        let childBox = new Clutter.ActorBox();

        for (let i = 0; i < this._thumbnails.length; i++) {
            let thumbnail = this._thumbnails[i];

            if (i > 0)
                y += spacing - Math.round(thumbnail.collapseFraction * spacing);

            let x1, x2;
            if (rtl) {
                x1 = box.x1 + slideOffset * thumbnail.slidePosition;
                x2 = x1 + thumbnailWidth;
            } else {
                x1 = box.x2 - thumbnailWidth + slideOffset * thumbnail.slidePosition;
                x2 = x1 + thumbnailWidth;
            }

            if (i == this._dropPlaceholderPos) {
                let [minHeight, placeholderHeight] = this._dropPlaceholder.get_preferred_height(-1);
                childBox.x1 = x1;
                childBox.x2 = x1 + thumbnailWidth;
                childBox.y1 = Math.round(y);
                childBox.y2 = Math.round(y + placeholderHeight);
                this._dropPlaceholder.allocate(childBox, flags);
                Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this, function() {
                    this._dropPlaceholder.show();
                }));
                y += placeholderHeight + spacing;
            }

            // We might end up with thumbnailHeight being something like 99.33
            // pixels. To make this work and not end up with a gap at the bottom,
            // we need some thumbnails to be 99 pixels and some 100 pixels height;
            // we compute an actual scale separately for each thumbnail.
            let y1 = Math.round(y);
            let y2 = Math.round(y + thumbnailHeight);
            let roundedVScale = (y2 - y1) / portholeHeight;

            if (thumbnail.metaWorkspace == indicatorWorkspace) {
                indicatorY1 = y1;
                indicatorY2 = y2;

                // passingthru67 - check if window-visible_on_all_workspaces state changed
                // if so, then we need to refresh thumbnails
                let refresh = this._checkWindowsOnAllWorkspaces(thumbnail);
                if (refresh) this.refreshThumbnails();
            }

            // Allocating a scaled actor is funny - x1/y1 correspond to the origin
            // of the actor, but x2/y2 are increased by the *unscaled* size.
            childBox.x1 = x1;
            childBox.x2 = x1 + portholeWidth;
            childBox.y1 = y1;
            // passingthru67 - size needs to include caption area
            //childBox.y2 = y1 + portholeHeight;
            childBox.y2 = y1 + portholeHeight + (captionBackgroundHeight/roundedVScale);

            thumbnail.actor.set_scale(roundedHScale, roundedVScale);
            thumbnail.actor.allocate(childBox, flags);

            // passingthru67 - set WorkspaceThumbnail labels
            if (this._mySettings.get_boolean('workspace-captions'))
                this._updateThumbnailCaption(thumbnail, i, captionHeight, captionBackgroundHeight);

            // We round the collapsing portion so that we don't get thumbnails resizing
            // during an animation due to differences in rounded, but leave the uncollapsed
            // portion unrounded so that non-animating we end up with the right total
            y += thumbnailHeight - Math.round(thumbnailHeight * thumbnail.collapseFraction);
        }

        if (rtl) {
            childBox.x1 = box.x1;
            childBox.x2 = box.x1 + thumbnailWidth;
        } else {
            childBox.x1 = box.x2 - thumbnailWidth;
            childBox.x2 = box.x2;
        }
        childBox.x1 -= indicatorLeftFullBorder;
        childBox.x2 += indicatorRightFullBorder;
        childBox.y1 = indicatorY1 - indicatorTopFullBorder;
        // passingthru67 - indicator needs to include caption
        //childBox.y2 = (indicatorY2 ? indicatorY2 : (indicatorY1 + thumbnailHeight)) + indicatorBottomFullBorder;
        childBox.y2 = (indicatorY2 ? indicatorY2 + captionBackgroundHeight : (indicatorY1 + thumbnailHeight + captionBackgroundHeight)) + indicatorBottomFullBorder;

        this._indicator.allocate(childBox, flags);
    },

    // override _activeWorkspaceChanged to eliminate errors thrown
    _activeWorkspaceChanged: function(wm, from, to, direction) {
        if (_DEBUG_) global.log("mythumbnailsBox: _activeWorkspaceChanged - thumbnail count = "+this._thumbnails.length);
        let thumbnail;
        let activeWorkspace = global.screen.get_active_workspace();
        for (let i = 0; i < this._thumbnails.length; i++) {
            if (this._thumbnails[i].metaWorkspace == activeWorkspace) {
                thumbnail = this._thumbnails[i];
                break;
            }
        }

        // passingthru67 - needed in case thumbnail is null outside of overview
        if (thumbnail == null)
            return

        // passingthru67 - needed in case thumbnail.actor is null outside of overview
        if (thumbnail.actor == null)
            return

        this._animatingIndicator = true;
        let indicatorThemeNode = this._indicator.get_theme_node();
        let indicatorTopFullBorder = indicatorThemeNode.get_padding(St.Side.TOP) + indicatorThemeNode.get_border_width(St.Side.TOP);
        this.indicatorY = this._indicator.allocation.y1 + indicatorTopFullBorder;

        Tweener.addTween(this,
                         { indicatorY: thumbnail.actor.allocation.y1,
                           time: WorkspacesView.WORKSPACE_SWITCH_TIME,
                           transition: 'easeOutQuad',
                           onComplete: function() {
                               this._animatingIndicator = false;
                               this._queueUpdateStates();
                           },
                           onCompleteScope: this
                         });
    }
});
