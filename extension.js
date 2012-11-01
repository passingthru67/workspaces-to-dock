/* ========================================================================================================
 * extension.js - gnome shell extension
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  This code was copied from the dash-to-dock extension https://github.com/micheleg/dash-to-dock
 *  and modified to create a workspaces dock. Many thanks to michele_g for a great extension.
 * ========================================================================================================
 */

const Me = imports.ui.extensionSystem.extensions["workspaces-to-dock@passingthru67.gmail.com"];
const Convenience = Me.convenience;
const Intellihide = Me.intellihide;
const DockedWorkspaces = Me.dockedWorkspaces;

let intellihide;
let dock;

function init() {
}

function enable() {
    dock = new DockedWorkspaces.dockedWorkspaces();
    intellihide = new Intellihide.intellihide(dock);
}

function disable() {
    intellihide.destroy();
    dock.destroy();

    dock = null;
    intellihide = null;
}

