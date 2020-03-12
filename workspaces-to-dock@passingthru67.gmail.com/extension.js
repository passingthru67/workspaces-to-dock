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

const Config = imports.misc.config;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Intellihide = Me.imports.intellihide;
const DockedWorkspaces = Me.imports.dockedWorkspaces;

var intellihide = null;
var dock = null;
var settings = null;
var workspacesToDockStylesheet = null;

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

function init() {
    Convenience.initTranslations();
}

function enable() {
    if (_DEBUG_) global.log("WorkspacesToDock: ENABLE");
    loadStylesheet();
    dock = new DockedWorkspaces.DockedWorkspaces();
    intellihide = new Intellihide.Intellihide(dock);
    settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
    bindSettingsChanges();
}

function disable() {
    if (_DEBUG_) global.log("WorkspacesToDock: DISABLE");
    unloadStylesheet();
    intellihide.destroy();
    dock.destroy();
    settings.run_dispose();

    dock = null;
    intellihide = null;
    settings = null;
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
    settings.connect('changed::shortcuts-panel-appsbutton-animation', function(){
        intellihide.destroy();
        dock.destroy();
        dock = new DockedWorkspaces.DockedWorkspaces();
        intellihide = new Intellihide.Intellihide(dock);
    });
}
