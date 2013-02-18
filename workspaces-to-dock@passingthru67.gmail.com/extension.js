/* ========================================================================================================
 * extension.js - gnome shell extension
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  This code was copied from the dash-to-dock extension https://github.com/micheleg/dash-to-dock
 *  and modified to create a workspaces dock. Many thanks to michele_g for a great extension.
 * ========================================================================================================
 */

const Config = imports.misc.config;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Intellihide = Me.imports.intellihide;
const DockedWorkspaces = Me.imports.dockedWorkspaces;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

let settings;
let intellihide;
let dock;

function init() {
    Convenience.initTranslations();
}

function enable() {
	// determine gnome shell version
    let gsCurrentVersion = Config.PACKAGE_VERSION.split('.');
	if (gsCurrentVersion.length != 3 || gsCurrentVersion[0] != 3) throw new Error(_("Unknown version number") + " (extension.js).");

    // enable the extension
    settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
    dock = new DockedWorkspaces.dockedWorkspaces(settings, gsCurrentVersion);
    intellihide = new Intellihide.intellihide(dock, settings, gsCurrentVersion);
}

function disable() {
    intellihide.destroy();
    dock.destroy();
    settings.run_dispose();

    dock = null;
    intellihide = null;
    settings = null;
}

