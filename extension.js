/* ========================================================================================================
 * extension.js - gnome shell extension
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  This code was copied from the dash-to-dock extension https://github.com/micheleg/dash-to-dock
 *  and modified to create a workspaces dock. Many thanks to michele_g for a great extension.
 * ========================================================================================================
 */

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Intellihide = Me.imports.intellihide;
const DockedWorkspaces = Me.imports.dockedWorkspaces;

let settings;
let intellihide;
let dock;

function init() {
}

function show() {
    dock.disableAutoHide();
}

function hide() {
    dock.enableAutoHide();
}

function enable() {
    settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
    dock = new DockedWorkspaces.dockedWorkspaces(settings);
    intellihide = new Intellihide.intellihide(show, hide, dock, settings);
}

function disable() {
    intellihide.destroy();
    dock.destroy();
    settings.run_dispose();

    dock = null;
    intellihide = null;
    settings = null;
}

