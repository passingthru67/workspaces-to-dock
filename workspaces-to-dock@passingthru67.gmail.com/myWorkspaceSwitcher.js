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

const Main = imports.ui.main;
const WorkspacesView = imports.ui.workspacesView;
const WindowManager = imports.ui.windowManager;
const Tweener = imports.ui.tweener;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

let nrows = 1;

var WorkspaceSwitcher = class WorkspacesToDock_WorkspaceSwitcher {
    constructor(params) {
        this._resetBindings();
        global.workspace_manager.override_workspace_layout(Meta.DisplayCorner.TOPLEFT, false, nrows, -1);
    }

    destroy() {
        this._resetBindings();
        global.workspace_manager.override_workspace_layout(Meta.DisplayCorner.TOPLEFT, false, -1, 1);
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
