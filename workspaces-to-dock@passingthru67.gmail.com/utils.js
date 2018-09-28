/* ========================================================================================================
 * utils.js - miscellaneous functions and classes for Workspaces-To-Dock
 * ========================================================================================================
 */

const _DEBUG_ = false;

const Meta = imports.gi.Meta;


/*
 * Workaround for Gnome 3.30 WS.get_neighbor bug when switching workspaces
 * from left/right.
 */

function get_neighbor(direction) {
    if (_DEBUG_) global.log("utils: get_neighbor");
    let workspaceManager = global.workspace_manager;
    let numWorkspaces = workspaceManager.n_workspaces;
    let activeWsIdx = workspaceManager.get_active_workspace_index();
    let newIdx = null;
    let newWs = null;

    switch (direction) {
        case Meta.MotionDirection.UP:
            if (_DEBUG_) global.log("utils: get_neighbor UP");
            newIdx = Math.max((activeWsIdx - 1), 0);
            break;
        case Meta.MotionDirection.DOWN:
            if (_DEBUG_) global.log("utils: get_neighbor DOWN");
            newIdx = Math.min((activeWsIdx + 1), numWorkspaces - 1);
            break;
        case Meta.MotionDirection.LEFT:
            if (_DEBUG_) global.log("utils: get_neighbor LEFT");
            newIdx = Math.max((activeWsIdx - 1), 0);
            break;
        case Meta.MotionDirection.RIGHT:
            if (_DEBUG_) global.log("utils: get_neighbor RIGHT");
            newIdx = Math.min((activeWsIdx + 1), numWorkspaces - 1);
            break;
    }

    if (_DEBUG_) global.log("utils: get_neighbor - newIdx="+newIdx);

    if (newIdx != null)
        newWs = workspaceManager.get_workspace_by_index(newIdx);

    return newWs;
}
