/* ========================================================================================================
 * extension.js - gnome shell extension
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  This code was copied from the dash-to-dock extension https://github.com/micheleg/dash-to-dock
 *  and modified to create a workspaces dock. Many thanks to michele_g for a great extension.
 * ========================================================================================================
 */

const _DEBUG_ = false;

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const St = imports.gi.St;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Mainloop = imports.mainloop;

const Config = imports.misc.config;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Intellihide = Me.imports.intellihide;
const DockedWorkspaces = Me.imports.dockedWorkspaces;

var intellihide = null;
var dock = null;
var settings = null;
var workspacesToDockStylesheet = null;
let monitorsChangedId = 0;
let monitorChangeTimeoutId = 0;
let monitorChangeDetected = false;

function loadStylesheet() {
    if (_DEBUG_) global.log("WorkspacesToDock: _loadStylesheet");
    // Get css filename
    let filename = "workspaces-to-dock.css";

    // Get default stylesheet
    let themeStylesheet = Main._getDefaultStylesheet();

    // Get current theme stylesheet
    if (Main.getThemeStylesheet())
        themeStylesheet = Main.getThemeStylesheet();

    // Get theme directory
    let themeDirectory = themeStylesheet.get_path() ? GLib.path_get_dirname(themeStylesheet.get_path()) : "";

    // Test for workspacesToDock stylesheet
    if (themeDirectory != "")
        workspacesToDockStylesheet = Gio.file_new_for_path(themeDirectory + '/extensions/workspaces-to-dock/' + filename);

    if (_DEBUG_) global.log("WorkspacesToDock: _loadStylesheet - test workspacesToDock stylesheet");
    if (!workspacesToDockStylesheet || !workspacesToDockStylesheet.query_exists(null)) {
        if (_DEBUG_) global.log("WorkspacesToDock: _loadStylesheet - Theme doesn't support workspacesToDock .. use default stylesheet");
        let defaultStylesheet = Gio.File.new_for_path(Me.path + "/themes/default/" + filename);
        if (defaultStylesheet.query_exists(null)) {
            workspacesToDockStylesheet = defaultStylesheet;
        } else {
            throw new Error(_("No Workspaces-To-Dock stylesheet found") + " (extension.js).");
        }
    }

    if (_DEBUG_) global.log("WorkspacesToDock: _loadStylesheet - stylesheet valid");
    let themeContext = St.ThemeContext.get_for_stage(global.stage);
    if (!themeContext)
        return false;

    let theme = themeContext.get_theme();
    if (!theme)
        return false;

    // Load workspacesToDock stylesheet
    if (_DEBUG_) global.log("WorkspacesToDock: _loadStylesheet - loading stylesheet");
    theme.load_stylesheet(workspacesToDockStylesheet);
    return true;
}

function unloadStylesheet() {
    if (_DEBUG_) global.log("WorkspacesToDock: _unloadStylesheet");
    let themeContext = St.ThemeContext.get_for_stage(global.stage);
    if (!themeContext)
        return false;

    let theme = themeContext.get_theme();
    if (!theme)
        return false;

    // Unload workspacesToDock stylesheet
    if (workspacesToDockStylesheet)
        theme.unload_stylesheet(workspacesToDockStylesheet);

    workspacesToDockStylesheet = null;
    return true;
}

function bindSettingsChanges() {
    // It's easier to just reload the extension when the dock position changes
    // rather than working out all changes to the different containers.
    settings.connect('changed::dock-position', function(){
        intellihide.destroy();
        dock.destroy();
        dock = new DockedWorkspaces.DockedWorkspaces();
        intellihide = new Intellihide.Intellihide(dock);
    });
    settings.connect('changed::horizontal-workspace-switching', function(){
        intellihide.destroy();
        dock.destroy();
        dock = new DockedWorkspaces.DockedWorkspaces();
        intellihide = new Intellihide.Intellihide(dock);
    });
    settings.connect('changed::dock-fixed', function(){
        intellihide.destroy();
        dock.destroy();
        dock = new DockedWorkspaces.DockedWorkspaces();
        intellihide = new Intellihide.Intellihide(dock);
    });
    settings.connect('changed::autohide-in-fullscreen', function(){
        intellihide.destroy();
        dock.destroy();
        dock = new DockedWorkspaces.DockedWorkspaces();
        intellihide = new Intellihide.Intellihide(dock);
    });
    settings.connect('changed::intellihide', function(){
        intellihide.destroy();
        dock.destroy();
        dock = new DockedWorkspaces.DockedWorkspaces();
        intellihide = new Intellihide.Intellihide(dock);
    });
    settings.connect('changed::intellihide-action', function(){
        intellihide.destroy();
        dock.destroy();
        dock = new DockedWorkspaces.DockedWorkspaces();
        intellihide = new Intellihide.Intellihide(dock);
    });
    settings.connect('changed::shortcuts-panel-orientation', function(){
        intellihide.destroy();
        dock.destroy();
        dock = new DockedWorkspaces.DockedWorkspaces();
        intellihide = new Intellihide.Intellihide(dock);
    });
    settings.connect('changed::customize-height', function(){
        intellihide.destroy();
        dock.destroy();
        dock = new DockedWorkspaces.DockedWorkspaces();
        intellihide = new Intellihide.Intellihide(dock);
    });
    settings.connect('changed::customize-height-option', function(){
        intellihide.destroy();
        dock.destroy();
        dock = new DockedWorkspaces.DockedWorkspaces();
        intellihide = new Intellihide.Intellihide(dock);
    });
    settings.connect('changed::center-thumbnails-on-dock', function(){
        intellihide.destroy();
        dock.destroy();
        dock = new DockedWorkspaces.DockedWorkspaces();
        intellihide = new Intellihide.Intellihide(dock);
    });
    settings.connect('changed::center-thumbnails-option', function(){
        intellihide.destroy();
        dock.destroy();
        dock = new DockedWorkspaces.DockedWorkspaces();
        intellihide = new Intellihide.Intellihide(dock);
    });
}

function createDockObjects() {
    if (_DEBUG_) global.log("WorkspacesToDock: createDockObjects");
    loadStylesheet();
    dock = new DockedWorkspaces.DockedWorkspaces();
    intellihide = new Intellihide.Intellihide(dock);
    settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
    bindSettingsChanges();
}

function destroyDockObjects() {
    if (_DEBUG_) global.log("WorkspacesToDock: destroyDockObjects");
    if (workspacesToDockStylesheet) {
        unloadStylesheet();
    }
    if (intellihide) {
        intellihide.destroy();
        intellihide = null;
    }
    if (dock) {
        dock.destroy();
        dock = null;
    }
    if (settings) {
        settings.run_dispose();
        settings = null;
    }
}

function init() {
    Convenience.initTranslations();
}

function enable() {
    if (_DEBUG_) global.log("WorkspacesToDock: ENABLE");
    createDockObjects();

    // It's easier to just reload the extension when the monitor changes
    let monitorManager = Meta.MonitorManager.get();
    monitorsChangedId = monitorManager.connect('monitors-changed', function(){
        if (!monitorChangeDetected) {
            if (_DEBUG_) global.log("WorkspacesToDock: MONITOR CHANGE DETECTED");
            monitorChangeDetected = true;
            destroyDockObjects();

            // Restore dock and monitor change detection after short timeout
            if (this.monitorChangeTimeoutId > 0) {
                Mainloop.source_remove(this.monitorChangeTimeoutId);
                monitorChangeTimeoutId = 0;
            }
            monitorChangeTimeoutId = Mainloop.timeout_add(1000, function() {
                monitorChangeDetected = false;
                createDockObjects();
            });

        } else {
            if (_DEBUG_) global.log("WorkspacesToDock: MONITOR CHANGE DETECTED AGAIN");
        }
    });
}

function disable() {
    if (_DEBUG_) global.log("WorkspacesToDock: DISABLE");
    destroyDockObjects();
}
