/* ========================================================================================================
 * dockedWorkspaces.js - dock object that holds the workspaces thumbnailsBox
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  This code was copied from the Frippery Bottom Panel extension http://frippery.org/extensions/
 *  and modified to create a workspaces switcher popup. Copyright (C) 2011-2015 R M Yorston.
 *
 *  Part of this code also comes from gnome-shell-extensions:
 *  http://git.gnome.org/browse/gnome-shell-extensions/
 * ========================================================================================================
 */

const _DEBUG_ = false;

const { Clutter, GLib, GObject, Meta, St, Shell } = imports.gi;
const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Main = imports.ui.main;
const WorkspacesView = imports.ui.workspacesView;
const WindowManager = imports.ui.windowManager;
const Tweener = imports.ui.tweener;

var ANIMATION_TIME = 0.1;
var DISPLAY_TIMEOUT = 600;

let GSFunctions = {};
let nrows = 1;

function get_ncols() {
    let workspaceManager = global.workspace_manager;
    let ncols = Math.floor(workspaceManager.n_workspaces/nrows);
    if ( workspaceManager.n_workspaces%nrows != 0 )
       ++ncols

    return ncols;
}

var MyWorkspaceSwitcherPopupList = GObject.registerClass(
class WorkspacesToDock_MyWorkspaceSwitcherPopupList extends St.Widget {
    _init() {
        super._init({ style_class: 'workspace-switcher' });

        this._itemSpacing = 0;
        this._childHeight = 0;
        this._childWidth = 0;

        this.connect('style-changed', () => {
           this._itemSpacing = this.get_theme_node().get_length('spacing');
        });
    }

    // vfunc_get_preferred_height(forWidth) {
    //     let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
    //     let themeNode = this.get_theme_node();
    //
    //     let availHeight = workArea.height;
    //     availHeight -= themeNode.get_vertical_padding();
    //
    //     let height = 0;
    //     for (let child of this.get_children()) {
    //         let [childMinHeight, childNaturalHeight] = child.get_preferred_height(-1);
    //         let [childMinWidth, childNaturalWidth] = child.get_preferred_width(childNaturalHeight);
    //         height += childNaturalHeight * workArea.width / workArea.height;
    //     }
    //
    //     let workspaceManager = global.workspace_manager;
    //     let spacing = this._itemSpacing * (workspaceManager.n_workspaces - 1);
    //     height += spacing;
    //     height = Math.min(height, availHeight);
    //
    //     this._childHeight = (height - spacing) / workspaceManager.n_workspaces;
    //
    //     return themeNode.adjust_preferred_height(height, height);
    // }
    //
    // vfunc_get_preferred_width(forHeight) {
    //     let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
    //     this._childWidth = Math.round(this._childHeight * workArea.width / workArea.height);
    //
    //     return [this._childWidth, this._childWidth];
    // }

    vfunc_get_preferred_width(forHeight) {
        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        let themeNode = this.get_theme_node();

        let availWidth = workArea.width;
        availWidth -= themeNode.get_horizontal_padding();

        let width = 0;
        for (let child of this.get_children()) {
            let [childMinHeight, childNaturalHeight] = child.get_preferred_height(-1);
            let [childMinWidth, childNaturalWidth] = child.get_preferred_width(childNaturalHeight);
            width += childNaturalHeight * workArea.width / workArea.height;
        }

        let workspaceManager = global.workspace_manager;
        let spacing = this._itemSpacing * (workspaceManager.n_workspaces - 1);
        width += spacing;
        width = Math.min(width, availWidth);

        this._childWidth = (width - spacing) / workspaceManager.n_workspaces;

        return themeNode.adjust_preferred_height(width, width);
    }

    vfunc_get_preferred_height(forWidth) {
        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        this._childHeight = Math.round(this._childWidth * workArea.height / workArea.width);

        return [this._childHeight, this._childHeight];
    }

    vfunc_allocate(box, flags) {
        this.set_allocation(box, flags);

        let themeNode = this.get_theme_node();
        box = themeNode.get_content_box(box);

        let childBox = new Clutter.ActorBox();

        // let y = box.y1;
        // let prevChildBoxY2 = box.y1 - this._itemSpacing;
        // for (let child of this.get_children()) {
        //     childBox.x1 = box.x1;
        //     childBox.x2 = box.x1 + this._childWidth;
        //     childBox.y1 = prevChildBoxY2 + this._itemSpacing;
        //     childBox.y2 = Math.round(y + this._childHeight);
        //     y += this._childHeight + this._itemSpacing;
        //     prevChildBoxY2 = childBox.y2;
        //     child.allocate(childBox, flags);
        // }
        let x = box.x1;
        let prevChildBoxX2 = box.x1 - this._itemSpacing;
        for (let child of this.get_children()) {
            childBox.y1 = box.y1;
            childBox.y2 = box.y1 + this._childHeight;
            childBox.x1 = prevChildBoxX2 + this._itemSpacing;
            childBox.x2 = Math.round(x + this._childWidth);
            x += this._childWidth + this._itemSpacing;
            prevChildBoxX2 = childBox.x2;
            child.allocate(childBox, flags);
        }
    }
});

var MyWorkspaceSwitcherPopup = GObject.registerClass(
class WorkspacesToDock_MyWorkspaceSwitcherPopup extends St.Widget {
    _init() {
        super._init({ x: 0,
                      y: 0,
                      width: global.screen_width,
                      height: global.screen_height,
                      style_class: 'workspace-switcher-group' });

        this.actor = this;

        Main.uiGroup.add_actor(this);

        this._timeoutId = 0;

        this._container = new St.BoxLayout({ style_class: 'workspace-switcher-container' });
        this.add_child(this._container);

        this._list = new MyWorkspaceSwitcherPopupList();
        this._container.add_child(this._list);

        this._redisplay();

        this.hide();

        let workspaceManager = global.workspace_manager;
        this._workspaceManagerSignals = [];
        this._workspaceManagerSignals.push(workspaceManager.connect('workspace-added',
                                                                    this._redisplay.bind(this)));
        this._workspaceManagerSignals.push(workspaceManager.connect('workspace-removed',
                                                                    this._redisplay.bind(this)));

        this.connect('destroy', this._onDestroy.bind(this));
    }

    _redisplay() {
        let workspaceManager = global.workspace_manager;

        this._list.destroy_all_children();

        for (let i = 0; i < workspaceManager.n_workspaces; i++) {
            let indicator = null;

           if (i == this._activeWorkspaceIndex && this._direction == Meta.MotionDirection.LEFT)
               indicator = new St.Bin({ style_class: 'ws-switcher-active-up' });
           else if(i == this._activeWorkspaceIndex && this._direction == Meta.MotionDirection.RIGHT)
               indicator = new St.Bin({ style_class: 'ws-switcher-active-down' });
           else if (i == this._activeWorkspaceIndex && this._direction == Meta.MotionDirection.UP)
               indicator = new St.Bin({ style_class: 'ws-switcher-active-up' });
           else if(i == this._activeWorkspaceIndex && this._direction == Meta.MotionDirection.DOWN)
               indicator = new St.Bin({ style_class: 'ws-switcher-active-down' });
           else
               indicator = new St.Bin({ style_class: 'ws-switcher-box' });

           this._list.add_actor(indicator);

        }

        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        let [containerMinHeight, containerNatHeight] = this._container.get_preferred_height(global.screen_width);
        let [containerMinWidth, containerNatWidth] = this._container.get_preferred_width(containerNatHeight);
        this._container.x = workArea.x + Math.floor((workArea.width - containerNatWidth) / 2);
        this._container.y = workArea.y + Math.floor((workArea.height - containerNatHeight) / 2);
    }

    _show() {
        Tweener.addTween(this._container, { opacity: 255,
                                            time: ANIMATION_TIME,
                                            transition: 'easeOutQuad'
                                           });
        this.actor.show();
    }

    display(direction, activeWorkspaceIndex) {
        this._direction = direction;
        this._activeWorkspaceIndex = activeWorkspaceIndex;

        this._redisplay();
        if (this._timeoutId != 0)
            Mainloop.source_remove(this._timeoutId);
        this._timeoutId = Mainloop.timeout_add(DISPLAY_TIMEOUT, this._onTimeout.bind(this));
        GLib.Source.set_name_by_id(this._timeoutId, '[gnome-shell] this._onTimeout');
        this._show();
    }

    _onTimeout() {
        Mainloop.source_remove(this._timeoutId);
        this._timeoutId = 0;
        Tweener.addTween(this._container, { opacity: 0.0,
                                            time: ANIMATION_TIME,
                                            transition: 'easeOutQuad',
                                            onComplete() { this.destroy(); },
                                            onCompleteScope: this
                                           });
        return GLib.SOURCE_REMOVE;
    }

    _onDestroy() {
        if (this._timeoutId)
            Mainloop.source_remove(this._timeoutId);
        this._timeoutId = 0;

        let workspaceManager = global.workspace_manager;
        for (let i = 0; i < this._workspaceManagerSignals.length; i++)
            workspaceManager.disconnect(this._workspaceManagerSignals[i]);

        this._workspaceManagerSignals = [];
    }
});

var WorkspaceSwitcher = class WorkspacesToDock_WorkspaceSwitcher {
    constructor(params) {
        // Override Gnome Shell functions
        this._overrideGnomeShellFunctions();
        this._resetBindings();

        global.workspace_manager.override_workspace_layout(Meta.DisplayCorner.TOPLEFT, false, nrows, -1);
    }

    destroy() {
        // Restor Gnome Shell functions
        this._restoreGnomeShellFunctions();
        this._resetBindings();

        global.workspace_manager.override_workspace_layout(Meta.DisplayCorner.TOPLEFT, false, -1, 1);
    }

    _overrideGnomeShellFunctions() {
        // Override showWorkspacesSwitcher to show custom horizontal workspace switcher popup
        GSFunctions['WindowManager_showWorkspaceSwitcher'] = WindowManager.WindowManager.prototype._showWorkspaceSwitcher;
        WindowManager.WindowManager.prototype._showWorkspaceSwitcher = function(display, window, binding) {
            let workspaceManager = display.get_workspace_manager();

            if (!Main.sessionMode.hasWorkspaces)
                return;

            if (workspaceManager.n_workspaces == 1)
                return;

            let [action,,,target] = binding.get_name().split('-');
            let newWs;
            let direction;

            if (action == 'move') {
                // "Moving" a window to another workspace doesn't make sense when
                // it cannot be unstuck, and is potentially confusing if a new
                // workspaces is added at the start/end
                if (window.is_always_on_all_workspaces() ||
                    (Meta.prefs_get_workspaces_only_on_primary() &&
                     window.get_monitor() != Main.layoutManager.primaryIndex))
                  return;
            }

            if (target == 'last') {
                direction = Meta.MotionDirection.RIGHT;
                newWs = workspaceManager.get_workspace_by_index(workspaceManager.n_workspaces - 1);
            } else if (isNaN(target)) {
                // Prepend a new workspace dynamically
                if (workspaceManager.get_active_workspace_index() == 0 &&
                    action == 'move' && target == 'left' && this._isWorkspacePrepended == false) {
                    this.insertWorkspace(0);
                    this._isWorkspacePrepended = true;
                }

                direction = Meta.MotionDirection[target.toUpperCase()];
                newWs = workspaceManager.get_active_workspace().get_neighbor(direction);
            } else if (target > 0) {
                target--;
                newWs = workspaceManager.get_workspace_by_index(target);

                if (workspaceManager.get_active_workspace().index() > target)
                    direction = Meta.MotionDirection.LEFT;
                else
                    direction = Meta.MotionDirection.RIGHT;
            }

            if (direction != Meta.MotionDirection.LEFT &&
                direction != Meta.MotionDirection.RIGHT)
                return;

            if (action == 'switch')
                this.actionMoveWorkspace(newWs);
            else
                this.actionMoveWindow(window, newWs);

            if (!Main.overview.visible) {
                if (this._workspaceSwitcherPopup == null) {
                    this._workspaceSwitcherPopup = new MyWorkspaceSwitcherPopup();
                    this._workspaceSwitcherPopup.connect('destroy', () => {
                            this._workspaceTracker.unblockUpdates();
                            this._workspaceSwitcherPopup = null;
                            this._isWorkspacePrepended = false;
                        });
                }
                this._workspaceSwitcherPopup.display(direction, newWs.index());
            }
        };

        // Override updateWorkspaceActors for horizontal animation of overview windows
        GSFunctions['WorkspacesView_updateWorkspaceActors'] = WorkspacesView.WorkspacesView.prototype._updateWorkspaceActors;
        WorkspacesView.WorkspacesView.prototype._updateWorkspaceActors = function(showAnimation) {
            let workspaceManager = global.workspace_manager;
            let active = workspaceManager.get_active_workspace_index();

            this._animating = showAnimation;

            for (let w = 0; w < this._workspaces.length; w++) {
                let workspace = this._workspaces[w];

                Tweener.removeTweens(workspace.actor);

                let x = (w - active) * this._fullGeometry.width;

                if (showAnimation) {
                    let params = { x: x,
                                   time: WorkspacesView.WORKSPACE_SWITCH_TIME,
                                   transition: 'easeOutQuad'
                                 };
                    // we have to call _updateVisibility() once before the
                    // animation and once afterwards - it does not really
                    // matter which tween we use, so we pick the first one ...
                    if (w == 0) {
                        this._updateVisibility();
                        params.onComplete = () => {
                                this._animating = false;
                                this._updateVisibility();
                            };
                    }
                    Tweener.addTween(workspace.actor, params);
                } else {
                    workspace.actor.set_position(x, 0);
                    if (w == 0)
                        this._updateVisibility();
                }
            }
        };

        // Override overview scroll event for horizontal scrolling of workspaces
        GSFunctions['WorkspacesDisplay_onScrollEvent'] = WorkspacesView.WorkspacesDisplay.prototype._onScrollEvent;
        WorkspacesView.WorkspacesDisplay.prototype._onScrollEvent = function(actor, event) {
            if (!this.actor.mapped)
                return Clutter.EVENT_PROPAGATE;

            if (this._workspacesOnlyOnPrimary &&
                this._getMonitorIndexForEvent(event) != this._primaryIndex)
                return Clutter.EVENT_PROPAGATE;

            let workspaceManager = global.workspace_manager;
            let activeWs = workspaceManager.get_active_workspace();
            let ws;
            switch (event.get_scroll_direction()) {
            case Clutter.ScrollDirection.UP:
                ws = activeWs.get_neighbor(Meta.MotionDirection.LEFT);
                break;
            case Clutter.ScrollDirection.DOWN:
                ws = activeWs.get_neighbor(Meta.MotionDirection.RIGHT);
                break;
            case Clutter.ScrollDirection.LEFT:
                ws = activeWs.get_neighbor(Meta.MotionDirection.LEFT);
                break;
            case Clutter.ScrollDirection.RIGHT:
                ws = activeWs.get_neighbor(Meta.MotionDirection.RIGHT);
                break;
            default:
                return Clutter.EVENT_PROPAGATE;
            }
            Main.wm.actionMoveWorkspace(ws);
            return Clutter.EVENT_STOP;
        };

    }

    _restoreGnomeShellFunctions() {
        // Restore showWorkspacesSwitcher to show normal workspace switcher popup
        WindowManager.WindowManager.prototype._showWorkspaceSwitcher = GSFunctions['WindowManager_showWorkspaceSwitcher'];

        // Restore updateWorkspaceActors to original vertical animation of overview windows
        WorkspacesView.WorkspacesView.prototype._updateWorkspaceActors = GSFunctions['WorkspacesView_updateWorkspaceActors'];

        // Restore onScrollEvent to original vertical scrolling of workspaces
        WorkspacesView.WorkspacesDisplay.prototype._onScrollEvent = GSFunctions['WorkspacesDisplay_onScrollEvent']
    }

    _resetBindings() {
        // Reset bindings to active showWorkspaceSwitcher function
        let wm = Main.wm;

        wm.setCustomKeybindingHandler('switch-to-workspace-left',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-right',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-up',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-down',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-last',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-left',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-right',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-up',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-down',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-1',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-2',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-3',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-4',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-5',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-6',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-7',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-8',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-9',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-10',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-11',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('switch-to-workspace-12',
                                        Shell.ActionMode.NORMAL |
                                        Shell.ActionMode.OVERVIEW,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-1',
                                        Shell.ActionMode.NORMAL,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-2',
                                        Shell.ActionMode.NORMAL,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-3',
                                        Shell.ActionMode.NORMAL,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-4',
                                        Shell.ActionMode.NORMAL,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-5',
                                        Shell.ActionMode.NORMAL,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-6',
                                        Shell.ActionMode.NORMAL,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-7',
                                        Shell.ActionMode.NORMAL,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-8',
                                        Shell.ActionMode.NORMAL,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-9',
                                        Shell.ActionMode.NORMAL,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-10',
                                        Shell.ActionMode.NORMAL,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-11',
                                        Shell.ActionMode.NORMAL,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-12',
                                        Shell.ActionMode.NORMAL,
                                        wm._showWorkspaceSwitcher.bind(wm));
        wm.setCustomKeybindingHandler('move-to-workspace-last',
                                        Shell.ActionMode.NORMAL,
                                        wm._showWorkspaceSwitcher.bind(wm));

        wm._workspaceSwitcherPopup = null;
    }
};
