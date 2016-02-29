/* ========================================================================================================
 * prefs.js - preferences
 * --------------------------------------------------------------------------------------------------------
 *  CREDITS:  This code was copied from the dash-to-dock extension https://github.com/micheleg/dash-to-dock
 *  and modified to create a workspaces dock. Many thanks to michele_g for a great extension.
 * ========================================================================================================
 */

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;


const WorkspacesToDockPreferencesWidget = new GObject.Class({
    Name: 'workspacesToDock.WorkspacesToDockPreferencesWidget',
    GTypeName: 'WorkspacesToDockPreferencesWidget',
    Extends: Gtk.Box,

    _init: function(params) {
        let self = this;
        this.parent(params);
        this.settings = Convenience.getSettings('org.gnome.shell.extensions.workspaces-to-dock');
        this._rtl = Gtk.Widget.get_default_direction() == Gtk.TextDirection.RTL;

        let notebook = new Gtk.Notebook();


        /* ================================================*/
        /* NOTEBOOK - GENERAL SETTINGS PAGE */
        /* ------------------------------------------------*/

        let notebookAppearanceSettings = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_left: 10,
            margin_right: 10,
            margin_bottom: 20
        });

        let notebookAppearanceSettingsTitle = new Gtk.Label({
            label: _("General"),
            use_markup: true,
            xalign: 0
        });


        /* TITLE: POSITION */

        let dockPositionTitle = new Gtk.Label({
            label: _("<b>Position</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });


        /* MONITOR WIDGETS */

        let dockMonitorLabel = new Gtk.Label({label: _("Show the dock on the following monitor (if attached)"), hexpand:true, xalign:0});
        let dockMonitorCombo = new Gtk.ComboBoxText({halign:Gtk.Align.END});
            dockMonitorCombo.append_text(_('Primary (default)'));
            dockMonitorCombo.append_text(_('1'));
            dockMonitorCombo.append_text(_('2'));
            dockMonitorCombo.append_text(_('3'));
            dockMonitorCombo.append_text(_('4'));

        let active = this.settings.get_int('preferred-monitor');
        if (active<0)
            active = 0;
        dockMonitorCombo.set_active(active);
        dockMonitorCombo.connect('changed', Lang.bind (this, function(widget) {
            let active = widget.get_active();
            if (active <=0)
                this.settings.set_int('preferred-monitor', -1);
            else
                this.settings.set_int('preferred-monitor', active );
        }));

        // Add to layout
        let dockMonitorControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        dockMonitorControlGrid.attach(dockMonitorLabel, 0, 0, 1, 1);
        dockMonitorControlGrid.attach(dockMonitorCombo, 1, 0, 1, 1);


        /* POSITION WIDGETS */

        let dockPositionLabel = new Gtk.Label({label: _("Show the dock at the following screen position"), hexpand:true, xalign:0});
        let dockPositionCombo = new Gtk.ComboBoxText({halign:Gtk.Align.END});
            // NOTE: Left and right are reversed in RTL languages

            dockPositionCombo.append_text(_("Top"));

            if (Gtk.Widget.get_default_direction() == Gtk.TextDirection.RTL) {
                dockPositionCombo.append_text(_("Left"));
            } else {
                dockPositionCombo.append_text(_("Right"));
            }

            dockPositionCombo.append_text(_("Bottom"));

            if (Gtk.Widget.get_default_direction() == Gtk.TextDirection.RTL) {
                dockPositionCombo.append_text(_("Right"));
            } else {
                dockPositionCombo.append_text(_("Left"));
            }

        let position = this.settings.get_enum('dock-position');
        dockPositionCombo.set_active(position);
        dockPositionCombo.connect('changed', Lang.bind (this, function(widget) {
                this.settings.set_enum('dock-position', widget.get_active());
        }));

        let hideDashButton = new Gtk.CheckButton({
            label: _("Hide the Gnome Shell Dash"),
            margin_left: 0,
            margin_top: 0
        });
        hideDashButton.set_active(this.settings.get_boolean('hide-dash'));
        hideDashButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('hide-dash', check.get_active());
        }));

        // Add to layout
        let dockPositionControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        dockPositionControlGrid.attach(dockPositionLabel, 0, 0, 1, 1);
        dockPositionControlGrid.attach(dockPositionCombo, 1, 0, 1, 1);
        dockPositionControlGrid.attach(hideDashButton, 0, 1, 1, 1);


        /* TITLE: HEIGHT */

        let dockHeightTitle = new Gtk.Label({
            label: _("<b>Height</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 25,
            margin_bottom: 5
        });


        /* HEIGHT WIDGETS */

        let customizeHeightLabel = new Gtk.Label({
            label: _("Customize the height of the dock"),
            xalign: 0,
            hexpand: true
        });

        let customizeHeightSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        customizeHeightSwitch.set_active(this.settings.get_boolean('customize-height'));
        customizeHeightSwitch.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('customize-height', check.get_active());
        }));

        let customizeHeightAutosize =  new Gtk.RadioButton({
            label: _("Autosize and center the dock based on workspaces and shortcuts"),
            margin_top: 0
        });
        customizeHeightAutosize.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) this.settings.set_int('customize-height-option', 0);
        }));

        let customizeHeightExtend =  new Gtk.RadioButton({
            label: _("Extend the height of the dock to fill the screen"),
            group: customizeHeightAutosize,
            margin_top: 0
        });
        customizeHeightExtend.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) this.settings.set_int('customize-height-option', 1);
        }));

        let intellihideOption = this.settings.get_int('customize-height-option');
        switch (intellihideOption) {
            case 0:
                customizeHeightAutosize.set_active(true); // autosize
                break;
            case 1:
                customizeHeightExtend.set_active(true); // extend
                break;
            default:
                customizeHeightAutosize.set_active(true); // default
        }

        let topMarginLabel = new Gtk.Label({
            label: _("Top margin"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let topMarginSpinner = new Gtk.SpinButton();
        topMarginSpinner.set_range(0, 25);
        topMarginSpinner.set_value(this.settings.get_double('top-margin') * 100);
        topMarginSpinner.set_digits(1);
        topMarginSpinner.set_increments(.5, 1);
        topMarginSpinner.set_size_request(120, -1);
        topMarginSpinner.connect('value-changed', Lang.bind(this, function(button) {
            let s = button.get_value() / 100;
            this.settings.set_double('top-margin', s);
        }));
        topMarginSpinner.connect('output', function(button, data) {
            var val = button.get_value().toFixed(1);
            button.set_text(val + "%");
            return true;
        });

        let bottomMarginLabel = new Gtk.Label({
            label: _("Bottom margin"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let bottomMarginSpinner = new Gtk.SpinButton();
        bottomMarginSpinner.set_range(0, 25);
        bottomMarginSpinner.set_value(this.settings.get_double('bottom-margin') * 100);
        bottomMarginSpinner.set_digits(1);
        bottomMarginSpinner.set_increments(.5, 1);
        bottomMarginSpinner.set_size_request(120, -1);
        bottomMarginSpinner.connect('value-changed', Lang.bind(this, function(button) {
            let s = button.get_value() / 100;
            this.settings.set_double('bottom-margin', s);
        }));
        bottomMarginSpinner.connect('output', function(button, data) {
            var val = button.get_value().toFixed(1);
            button.set_text(val + "%");
            return true;
        });

        // Add to layout
        let dockHeightControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        let dockHeightContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 10
        });
        dockHeightControlGrid.attach(customizeHeightLabel, 0, 0, 1, 1);
        dockHeightControlGrid.attach(customizeHeightSwitch, 1, 0, 1, 1);
        dockHeightContainerGrid.attach(customizeHeightAutosize, 0, 0, 1, 1);
        dockHeightContainerGrid.attach(customizeHeightExtend, 0, 1, 1, 1);
        dockHeightContainerGrid.attach(topMarginLabel, 0, 2, 1, 1);
        dockHeightContainerGrid.attach(topMarginSpinner, 1, 2, 1, 1);
        dockHeightContainerGrid.attach(bottomMarginLabel, 0, 3, 1, 1);
        dockHeightContainerGrid.attach(bottomMarginSpinner, 1, 3, 1, 1);

        // Bind interactions
        this.settings.bind('customize-height', dockHeightContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* TITLE: BACKGROUND */

        let backgroundTitle = new Gtk.Label({
            label: _("<b>Background</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });


        /* OPAQUE LAYER WIDGETS */

        let opaqueLayerLabel = new Gtk.Label({
            label: _("Customize the dock background opacity"),
            xalign: 0,
            hexpand: true
        });

        let opaqueLayerSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        opaqueLayerSwitch.set_active(this.settings.get_boolean('opaque-background'));
        opaqueLayerSwitch.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('opaque-background', check.get_active());
        }));

        let layerOpacityLabel = new Gtk.Label({
            label: _("Opacity"),
            use_markup: true,
            xalign: 0,
        });

        let layerOpacityScaler = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            valuePos: Gtk.PositionType.RIGHT,
            halign: Gtk.Align.START,
            margin_left: 20
        });
        layerOpacityScaler.set_range(0, 100);
        layerOpacityScaler.set_value(this.settings.get_double('background-opacity') * 100);
        layerOpacityScaler.set_digits(0);
        layerOpacityScaler.set_increments(5, 5);
        layerOpacityScaler.set_size_request(200, -1);
        layerOpacityScaler.connect('value-changed', Lang.bind(this, function(button) {
            let s = button.get_value() / 100;
            this.settings.set_double('background-opacity', s);
        }));

        let opaqueLayeralwaysVisibleButton = new Gtk.CheckButton({
            label: _("Only when the dock is shown by mouse hover"),
            margin_left: 0
        });
        opaqueLayeralwaysVisibleButton.set_active(!this.settings.get_boolean('opaque-background-always'));
        opaqueLayeralwaysVisibleButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('opaque-background-always', !check.get_active());
        }));

        // Add to layout
        let backgroundControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_left: 0
        });
        let backgroundContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_left: 10
        });
        backgroundControlGrid.attach(opaqueLayerLabel, 0, 0, 1, 1);
        backgroundControlGrid.attach(opaqueLayerSwitch, 1, 0, 1, 1);
        backgroundContainerGrid.attach(layerOpacityLabel, 0, 0, 1, 1);
        backgroundContainerGrid.attach(layerOpacityScaler, 1, 0, 1, 1);
        backgroundContainerGrid.attach(opaqueLayeralwaysVisibleButton, 0, 1, 2, 1);

        // Bind interactions
        this.settings.bind('opaque-background', backgroundContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* TOGGLE OVERVIEW WIDGETS */
        let toggleOverviewButton = new Gtk.CheckButton({
            label: _("Toggle Gnome Shell's overview mode with right click"),
            margin_left: 0,
            margin_top: 10
        });
        toggleOverviewButton.set_active(this.settings.get_boolean('toggle-overview'));
        toggleOverviewButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('toggle-overview', check.get_active());
        }));


        /* ADD TO NOTEBOOK PAGE */
        notebookAppearanceSettings.add(dockPositionTitle);
        notebookAppearanceSettings.add(dockMonitorControlGrid);
        notebookAppearanceSettings.add(dockPositionControlGrid);
        notebookAppearanceSettings.add(dockHeightTitle);
        notebookAppearanceSettings.add(dockHeightControlGrid);
        notebookAppearanceSettings.add(dockHeightContainerGrid);
        notebookAppearanceSettings.add(backgroundTitle);
        notebookAppearanceSettings.add(backgroundControlGrid);
        notebookAppearanceSettings.add(backgroundContainerGrid);
        notebookAppearanceSettings.add(toggleOverviewButton);
        notebook.append_page(notebookAppearanceSettings, notebookAppearanceSettingsTitle);


        /* ================================================*/
        /* NOTEBOOK - BEHAVIOR SETTINGS PAGE */
        /* ------------------------------------------------*/

        let notebookBehaviorSettings = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_left: 10,
            margin_right: 10
        });

        let notebookBehaviorSettingsTitle = new Gtk.Label({
            label: _("Behavior"),
            use_markup: true,
            xalign: 0
        });


        /* TITLE: INTELLIGENT HIDING */

        let visibilityTitle = new Gtk.Label({
            label: _("<b>Intelligent Hiding</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });


        /* ALWAYS VISIBLE WIDGETS */

        let alwaysVisibleLabel = new Gtk.Label({
            label: _("Dock is fixed and always visible. Turn off intelligent hiding"),
            use_markup: true,
            xalign: 0,
            margin_top: 0,
            hexpand: true
        });

        let alwaysVisibleSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END,
            margin_top: 0
        });
        alwaysVisibleSwitch.set_active(this.settings.get_boolean('dock-fixed'));
        alwaysVisibleSwitch.connect("notify::active", Lang.bind(this, function(check) {
            this.settings.set_boolean('dock-fixed', check.get_active());
        }));

        // Add to layout
        let visibilityControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false
        });
        let visibilityContainerBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
            homogeneous: false,
            margin_left: 10,
            margin_top: 0,
            margin_bottom: 10,
            margin_right: 0
        });
        visibilityControlGrid.attach(alwaysVisibleLabel, 0, 0, 1, 1);
        visibilityControlGrid.attach(alwaysVisibleSwitch, 1, 0, 1, 1);

        // Bind interactions
        this.settings.bind('dock-fixed', visibilityContainerBox, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);


        /* TIMING WIDGETS */

        let timingLabel = new Gtk.Label({
            label: _("<b>Timing</b> : Adjust animation, show delay, and hide delay timing"),
            use_markup: true,
            xalign: 0,
            hexpand: true,
            margin_top: 10
        });

        let timingOptionsButton = new Gtk.Button({
            label: _("Timing Options .."),
            margin_top: 10,
            halign: Gtk.Align.START
        });
        timingOptionsButton.connect("clicked", Lang.bind(this, function() {
            let dialog = new Gtk.Dialog({ title: _("Timing Options"),
                                          transient_for: notebook.get_toplevel(),
                                          use_header_bar: true,
                                          modal: true });


            /* TIMING OPTIONS DIALOG */

            let animationTimeLabel = new Gtk.Label({
                label: _("Animation time [ms]"),
                use_markup: true,
                xalign: 0,
                hexpand: true,
                margin_right: 5,
                margin_top: 0
            });

            let animationTimeSpinner = new Gtk.SpinButton({
                halign: Gtk.Align.END,
                margin_top: 0
            });
            animationTimeSpinner.set_sensitive(true);
            animationTimeSpinner.set_range(0, 5000);
            animationTimeSpinner.set_value(this.settings.get_double("animation-time") * 1000);
            animationTimeSpinner.set_increments(50, 100);
            animationTimeSpinner.connect("value-changed", Lang.bind(this, function(button) {
                let s = button.get_value_as_int() / 1000;
                this.settings.set_double("animation-time", s);
            }));

            let showDelayLabel = new Gtk.Label({
                label: _("Show delay [ms]"),
                use_markup: true,
                xalign: 0,
                hexpand: true
            });

            let showDelaySpinner = new Gtk.SpinButton({
                halign: Gtk.Align.END
            });
            showDelaySpinner.set_sensitive(true);
            showDelaySpinner.set_range(0, 5000);
            showDelaySpinner.set_value(this.settings.get_double("show-delay") * 1000);
            showDelaySpinner.set_increments(50, 100);
            showDelaySpinner.connect("value-changed", Lang.bind(this, function(button) {
                let s = button.get_value_as_int() / 1000;
                this.settings.set_double("show-delay", s);
            }));

            let hideDelayLabel = new Gtk.Label({
                label: _("Hide delay [ms]"),
                use_markup: true,
                xalign: 0,
                hexpand: true
            });

            let hideDelaySpinner = new Gtk.SpinButton({
                halign: Gtk.Align.END
            });
            hideDelaySpinner.set_sensitive(true);
            hideDelaySpinner.set_range(0, 5000);
            hideDelaySpinner.set_value(this.settings.get_double("hide-delay") * 1000);
            hideDelaySpinner.set_increments(50, 100);
            hideDelaySpinner.connect("value-changed", Lang.bind(this, function(button) {
                let s = button.get_value_as_int() / 1000;
                this.settings.set_double("hide-delay", s);
            }));

            // Add to layout
            let timingDialogGrid = new Gtk.Grid({
                row_homogeneous: false,
                column_homogeneous: false,
                margin_top: 0
            });
            timingDialogGrid.attach(animationTimeLabel, 0, 1, 1, 1);
            timingDialogGrid.attach(animationTimeSpinner, 1, 1, 1, 1);
            timingDialogGrid.attach(showDelayLabel, 0, 2, 1, 1);
            timingDialogGrid.attach(showDelaySpinner, 1, 2, 1, 1);
            timingDialogGrid.attach(hideDelayLabel, 0, 3, 1, 1);
            timingDialogGrid.attach(hideDelaySpinner, 1, 3, 1, 1);

            // Add to dialog
            let timingDialogContainerBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 0,
                homogeneous: false,
                margin_left: 10,
                margin_top: 20,
                margin_bottom: 20,
                margin_right: 10
            });
            timingDialogContainerBox.add(timingDialogGrid);
            dialog.get_content_area().add(timingDialogContainerBox);
            dialog.show_all();
        }));

        // Add to layout
        let timingGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0
        });
        timingGrid.attach(timingLabel, 0, 0, 1, 1);
        timingGrid.attach(timingOptionsButton, 0, 1, 1, 1);

        visibilityContainerBox.add(timingGrid);


        /* AUTOHIDE WIDGETS */

        let autohideLabel = new Gtk.Label({
            label: _("<b>Autohide</b> : Show the dock on mouse hover"),
            use_markup: true,
            xalign: 0,
            hexpand: true,
            margin_top: 0
        });

        let autohideSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END,
            margin_top: 0
        });
        autohideSwitch.set_active(this.settings.get_boolean('autohide'));
        autohideSwitch.connect("notify::active", Lang.bind(this, function(check) {
            this.settings.set_boolean('autohide', check.get_active());
        }));

        let autohideOptionsButton = new Gtk.Button({
            label: _("Autohide Options .."),
            margin_top: 10,
            halign: Gtk.Align.START
        });
        autohideOptionsButton.connect("clicked", Lang.bind(this, function() {
            let dialog = new Gtk.Dialog({ title: _("Autohide Options"),
                                          transient_for: notebook.get_toplevel(),
                                          use_header_bar: true,
                                          modal: true });


            /* AUTOHIDE OPTIONS DIALOG */

            let requireClickButton = new Gtk.CheckButton({
                label: _("Require click to show the dock when window maximized"),
                margin_left: 0,
                margin_top: 0
            });
            requireClickButton.set_active(this.settings.get_boolean('require-click-to-show'));
            requireClickButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('require-click-to-show', check.get_active());
            }));

            let requirePressureButton = new Gtk.CheckButton({
                label: _("Require pressure to show the dock"),
                margin_left: 0,
                margin_top: 0
            });
            requirePressureButton.set_active(this.settings.get_boolean('require-pressure-to-show'));
            requirePressureButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('require-pressure-to-show', check.get_active());
            }));

            let pressureThresholdLabel = new Gtk.Label({
                label: _("Pressure threshold [px]"),
                use_markup: true,
                xalign: 0,
                margin_left: 25,
                margin_top: 0,
                hexpand: true
            });

            let pressureThresholdSpinner = new Gtk.SpinButton({
                halign: Gtk.Align.END,
                margin_top: 0
            });
            pressureThresholdSpinner.set_sensitive(true);
            pressureThresholdSpinner.set_range(10, 1000);
            pressureThresholdSpinner.set_value(this.settings.get_double("pressure-threshold") * 1);
            pressureThresholdSpinner.set_increments(10, 20);
            pressureThresholdSpinner.connect("value-changed", Lang.bind(this, function(button) {
                let s = button.get_value_as_int() / 1;
                this.settings.set_double("pressure-threshold", s);
            }));

            let speedLimitButton = new Gtk.CheckButton({
                label: _("Limit pressure sense to slow mouse speeds"),
                margin_left: 0,
                margin_top: 0
            });
            speedLimitButton.set_active(this.settings.get_boolean('use-pressure-speed-limit'));
            speedLimitButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('use-pressure-speed-limit', check.get_active());
            }));

            let speedLimitLabel = new Gtk.Label({
                label: _("Maximum speed [px]"),
                use_markup: true,
                xalign: 0,
                margin_left: 25,
                margin_top: 0,
                hexpand: true
            });

            let speedLimitSpinner = new Gtk.SpinButton({
                halign: Gtk.Align.END,
                margin_top: 0
            });
            speedLimitSpinner.set_sensitive(true);
            speedLimitSpinner.set_range(10, 1000);
            speedLimitSpinner.set_value(this.settings.get_double("pressure-speed-limit") * 1);
            speedLimitSpinner.set_increments(10, 20);
            speedLimitSpinner.connect("value-changed", Lang.bind(this, function(button) {
                let s = button.get_value_as_int() / 1;
                this.settings.set_double("pressure-speed-limit", s);
            }));

            let speedLimitDescription = new Gtk.Label({
                label: _("NOTE: For dual monitor setups. Allows the mouse to pass through \nthe barrier by attacking the edge of the screen with a quick stroke."),
                use_markup: true,
                xalign: 0,
                margin_left: 25,
                margin_top: 0,
                hexpand: false
            })

            // Add to layout
            let autohideOptionsDialogGrid = new Gtk.Grid({
                row_homogeneous: false,
                column_homogeneous: false
            });
            autohideOptionsDialogGrid.attach(requireClickButton, 0, 0, 2, 1);
            autohideOptionsDialogGrid.attach(requirePressureButton, 0, 1, 2, 1);
            autohideOptionsDialogGrid.attach(pressureThresholdLabel, 0, 2, 1, 1);
            autohideOptionsDialogGrid.attach(pressureThresholdSpinner, 1, 2, 1, 1);
            autohideOptionsDialogGrid.attach(speedLimitButton, 0, 3, 2, 1);
            autohideOptionsDialogGrid.attach(speedLimitLabel, 0, 4, 1, 1);
            autohideOptionsDialogGrid.attach(speedLimitSpinner, 1, 4, 1, 1);
            autohideOptionsDialogGrid.attach(speedLimitDescription, 0, 5, 2, 1);

            // Bind interactions
            this.settings.bind('require-pressure-to-show', pressureThresholdLabel, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('require-pressure-to-show', pressureThresholdSpinner, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('use-pressure-speed-limit', speedLimitLabel, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('use-pressure-speed-limit', speedLimitSpinner, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
            this.settings.bind('use-pressure-speed-limit', speedLimitDescription, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

            // Add to dialog
            let autohideOptionsDialogContainerBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 0,
                homogeneous: false,
                margin_left: 10,
                margin_top: 20,
                margin_bottom: 20,
                margin_right: 10
            });
            autohideOptionsDialogContainerBox.add(autohideOptionsDialogGrid);
            dialog.get_content_area().add(autohideOptionsDialogContainerBox);
            dialog.show_all();
        }));

        // Add to layout
        let autohideControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 10
        });
        let autohideContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false
        });
        autohideControlGrid.attach(autohideLabel, 0, 0, 1, 1);
        autohideControlGrid.attach(autohideSwitch, 1, 0, 1, 1);
        autohideContainerGrid.attach(autohideOptionsButton, 0, 0, 1, 1);

        visibilityContainerBox.add(autohideControlGrid);
        visibilityContainerBox.add(autohideContainerGrid);

        // Bind interactions
        this.settings.bind('autohide', autohideContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* INTELLIHIDE WIDGETS */

        let intellihideLabel = new Gtk.Label({
            label: _("<b>Intellihide</b> : Show the dock unless a window overlaps"),
            use_markup: true,
            xalign: 0,
            hexpand: true,
            margin_top: 0
        });

        let intellihideSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END,
            margin_top: 0
        });
        intellihideSwitch.set_active(this.settings.get_boolean('intellihide'));
        intellihideSwitch.connect("notify::active", Lang.bind(this, function(check) {
            this.settings.set_boolean('intellihide', check.get_active());
        }));

        let intellihideOptionsButton = new Gtk.Button({
            label: _("Intellihide Options .."),
            margin_top: 10,
            halign: Gtk.Align.START
        });
        intellihideOptionsButton.connect("clicked", Lang.bind(this, function() {
            let dialog = new Gtk.Dialog({ title: _("Intellihide Options"),
                                          transient_for: notebook.get_toplevel(),
                                          use_header_bar: true,
                                          modal: true });


            /* INTELLIHIDE OPTIONS DIALOG */

            let intellihideNormal =  new Gtk.RadioButton({
                label: _("Dodge all windows"),
                margin_top: 0
            });
            intellihideNormal.connect('toggled', Lang.bind(this, function(check){
                if (check.get_active()) this.settings.set_int('intellihide-option', 0);
            }));

            let intellihideFocusApp =  new Gtk.RadioButton({
                label: _("Dodge all instances of focused app"),
                group: intellihideNormal,
                margin_top: 0
            });
            intellihideFocusApp.connect('toggled', Lang.bind(this, function(check){
                if (check.get_active()) this.settings.set_int('intellihide-option', 1);
            }));

            let intellihideTopWindow =  new Gtk.RadioButton({
                label: _("Dodge only top instance of focused app"),
                group: intellihideNormal,
                margin_top: 0
            });
            intellihideTopWindow.connect('toggled', Lang.bind(this, function(check){
                if (check.get_active()) this.settings.set_int('intellihide-option', 2);
            }));

            let intellihideOption = this.settings.get_int('intellihide-option');
            switch (intellihideOption) {
                case 0:
                    intellihideNormal.set_active(true); // any window .. normal mode
                    break;
                case 1:
                    intellihideFocusApp.set_active(true); // focused application windows mode
                    break;
                case 2:
                    intellihideTopWindow.set_active(true); // top focused application window mode
                    break;
                default:
                    intellihideNormal.set_active(true); // default .. any window
            }

            let ignoreTopPanelButton = new Gtk.CheckButton({
                label: _("Ignore top panel menus"),
                margin_left: 0,
                margin_top: 0
            });
            ignoreTopPanelButton.set_active(this.settings.get_boolean('ignore-top-panel'));
            ignoreTopPanelButton.connect('toggled', Lang.bind(this, function(check) {
                this.settings.set_boolean('ignore-top-panel', check.get_active());
            }));

            // Add to layout
            let intellihideOptionsDialogGrid = new Gtk.Grid({
                row_homogeneous: false,
                column_homogeneous: false
            });
            intellihideOptionsDialogGrid.attach(intellihideNormal, 0, 0, 1, 1);
            intellihideOptionsDialogGrid.attach(intellihideFocusApp, 0, 1, 1, 1);
            intellihideOptionsDialogGrid.attach(intellihideTopWindow, 0, 2, 1, 1);
            intellihideOptionsDialogGrid.attach(ignoreTopPanelButton, 0, 3, 1, 1);

            // Add to dialog
            let intellihideOptionsDialogContainerBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 0,
                homogeneous: false,
                margin_left: 10,
                margin_top: 20,
                margin_bottom: 20,
                margin_right: 10
            });
            intellihideOptionsDialogContainerBox.add(intellihideOptionsDialogGrid);
            dialog.get_content_area().add(intellihideOptionsDialogContainerBox);
            dialog.show_all();
        }));

        // Add to layout
        let intellihideControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 10
        });
        let intellihideContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false
        });
        intellihideControlGrid.attach(intellihideLabel, 0, 0, 1, 1);
        intellihideControlGrid.attach(intellihideSwitch, 1, 0, 1, 1);
        intellihideContainerGrid.attach(intellihideOptionsButton, 0, 0, 1, 1);

        visibilityContainerBox.add(intellihideControlGrid);
        visibilityContainerBox.add(intellihideContainerGrid);

        // Bind interactions
        this.settings.bind('intellihide', intellihideContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* OVERVIEW ACTION */

        let overviewActionLabel = new Gtk.Label({label: _("What should we do with the dock in overview mode?"),
            hexpand:true,
            xalign:0
        });
        let overviewActionCombo = new Gtk.ComboBoxText({
            halign:Gtk.Align.END
        });
        overviewActionCombo.append_text(_('Show'));
        overviewActionCombo.append_text(_('Hide'));
        overviewActionCombo.append_text(_('Partially Hide'));

        let overviewAction = this.settings.get_enum('overview-action');
        overviewActionCombo.set_active(overviewAction);
        overviewActionCombo.connect('changed', Lang.bind (this, function(widget) {
            this.settings.set_enum('overview-action', widget.get_active());
        }));

        // Add to layout
        let overviewActionGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 10,
            margin_left: 0
        });
        overviewActionGrid.attach(overviewActionLabel, 0, 0, 1, 1);
        overviewActionGrid.attach(overviewActionCombo, 1, 0, 1, 1);

        visibilityContainerBox.add(overviewActionGrid);


        /* TITLE: MISC OPTIONS */

        let miscOptionsTitle = new Gtk.Label({
            label: _("<b>Miscellaneous Options</b>"),
            use_markup: true,
            xalign: 0,
            hexpand: true,
            margin_top: 15,
            margin_bottom: 5
        });


        /* MISC OPTIONS WIDGETS */

        let leaveVisibleButton = new Gtk.CheckButton({
            label: _("Leave a visible edge when dock is hidden"),
            margin_left: 0,
            margin_top: 0
        });
        leaveVisibleButton.set_active(this.settings.get_boolean('dock-edge-visible'));
        leaveVisibleButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('dock-edge-visible', check.get_active());
        }));

        let disableScrollButton = new Gtk.CheckButton({
            label: _("Disable scroll when dock is hidden to prevent workspace switching"),
            margin_left: 0,
            margin_top: 0
        });
        disableScrollButton.set_active(this.settings.get_boolean('disable-scroll'));
        disableScrollButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('disable-scroll', check.get_active());
        }));

        let dashToDockHoverButton = new Gtk.CheckButton({
            label: _("Show the dock when hovering over Dash-To-Dock extension"),
            margin_left: 0,
            margin_top: 0
        });
        dashToDockHoverButton.set_active(this.settings.get_boolean('dashtodock-hover'));
        dashToDockHoverButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('dashtodock-hover', check.get_active());
        }));

        let quickShowButton = new Gtk.CheckButton({
            label: _("Show the dock temporarily when switching workspaces"),
            margin_left: 0,
            margin_top: 0
        });
        quickShowButton.set_active(this.settings.get_boolean('quick-show-on-workspace-change'));
        quickShowButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('quick-show-on-workspace-change', check.get_active());
        }));

        let quickShowLabel = new Gtk.Label({
            label: _("Length of time shown [ms]"),
            use_markup: true,
            xalign: 0,
            margin_left: 25,
            margin_top: 0,
            hexpand: true
        });

        let quickShowSpinner = new Gtk.SpinButton({
            halign: Gtk.Align.END,
            margin_top: 0
        });
        quickShowSpinner.set_sensitive(true);
        quickShowSpinner.set_range(100, 3000);
        quickShowSpinner.set_value(this.settings.get_double("quick-show-timeout") * 1);
        quickShowSpinner.set_increments(100, 1000);
        quickShowSpinner.connect("value-changed", Lang.bind(this, function(button) {
            let s = button.get_value_as_int() / 1;
            this.settings.set_double("quick-show-timeout", s);
        }));

        let toggleDockShortcutButton = new Gtk.CheckButton({
            label: _("Toggle the dock with a keyboard shortcut"),
            margin_left: 0,
            margin_top: 0
        });
        toggleDockShortcutButton.set_active(this.settings.get_boolean('toggle-dock-with-keyboard-shortcut'));
        toggleDockShortcutButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('toggle-dock-with-keyboard-shortcut', check.get_active());
        }));

        let toggleDockShortcutLabel = new Gtk.Label({
            label: _("Keyboard shortcut"),
            use_markup: true,
            xalign: 0,
            margin_left: 25,
            margin_top: 0,
            hexpand: true
        });

        let toggleDockShortcutEntry = new Gtk.Entry({
            margin_top: 0,
            margin_left: 5,
            margin_right: 0,
            halign: Gtk.Align.END
        });
        toggleDockShortcutEntry.set_width_chars(20);
        toggleDockShortcutEntry.set_text(this.settings.get_strv('dock-keyboard-shortcut')[0]);
        toggleDockShortcutEntry.connect('changed', Lang.bind(this, function(entry) {
            let [key, mods] = Gtk.accelerator_parse(entry.get_text());
            if(Gtk.accelerator_valid(key, mods)) {
                toggleDockShortcutEntry["secondary-icon-name"] = null;
                toggleDockShortcutEntry["secondary-icon-tooltip-text"] = null;
                let shortcut = Gtk.accelerator_name(key, mods);
                this.settings.set_strv('dock-keyboard-shortcut', [shortcut]);
            } else {
                toggleDockShortcutEntry["secondary-icon-name"] = "dialog-warning-symbolic";
                toggleDockShortcutEntry["secondary-icon-tooltip-text"] = _("Invalid accelerator. Try F12, <Super>space, <Ctrl><Alt><Shift>w, etc.");
            }
        }));

        // Add to layout
        let miscOptionsContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false
        });
        miscOptionsContainerGrid.attach(miscOptionsTitle, 0, 0, 2, 1);
        miscOptionsContainerGrid.attach(leaveVisibleButton, 0, 1, 2, 1);
        miscOptionsContainerGrid.attach(disableScrollButton, 0, 2, 2, 1);
        miscOptionsContainerGrid.attach(dashToDockHoverButton, 0, 3, 2, 1);
        miscOptionsContainerGrid.attach(quickShowButton, 0, 4, 2, 1);
        miscOptionsContainerGrid.attach(quickShowLabel, 0, 5, 1, 1);
        miscOptionsContainerGrid.attach(quickShowSpinner, 1, 5, 1, 1);
        miscOptionsContainerGrid.attach(toggleDockShortcutButton, 0, 6, 2, 1);
        miscOptionsContainerGrid.attach(toggleDockShortcutLabel, 0, 7, 1, 1);
        miscOptionsContainerGrid.attach(toggleDockShortcutEntry, 1, 7, 1, 1);

        visibilityContainerBox.add(miscOptionsContainerGrid);

        /* Bind interactions */
        this.settings.bind('toggle-dock-with-keyboard-shortcut', toggleDockShortcutEntry, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('quick-show-on-workspace-change', quickShowLabel, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
        this.settings.bind('quick-show-on-workspace-change', quickShowSpinner, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* ADD TO NOTEBOOK PAGE */
        notebookBehaviorSettings.add(visibilityTitle);
        notebookBehaviorSettings.add(visibilityControlGrid);
        notebookBehaviorSettings.add(visibilityContainerBox);
        notebook.append_page(notebookBehaviorSettings, notebookBehaviorSettingsTitle);


        /* ================================================*/
        /* NOTEBOOK - THUMBNAILS SETTINGS PAGE */
        /* ------------------------------------------------*/

        let notebookWorkspacesSettings = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_left: 10,
            margin_right: 10
        });

        let notebookWorkspacesSettingsTitle = new Gtk.Label({
            label: _("Thumbnails"),
            use_markup: true,
            xalign: 0
        });


        /* TITLE: THUMBNAILS */

        let customizeThumbnailTitle = new Gtk.Label({
            label: _("<b>Thumbnail Size</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });


        /* THUMBNAIL SIZE WIDGETS */

        let customizeThumbnailLabel = new Gtk.Label({
            label: _("Customize the workspace thumbnail size"),
            xalign: 0,
            hexpand: true
        });

        let customizeThumbnailSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        customizeThumbnailSwitch.set_active(this.settings.get_boolean('customize-thumbnail'));
        customizeThumbnailSwitch.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('customize-thumbnail', check.get_active());
        }));

        let thumbnailSizeLabel = new Gtk.Label({
            label: _("Thumbnail size"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let thumbnailSizeSpinner = new Gtk.SpinButton();
        thumbnailSizeSpinner.set_range(10, 25);
        thumbnailSizeSpinner.set_value(this.settings.get_double('thumbnail-size') * 100);
        thumbnailSizeSpinner.set_digits(1);
        thumbnailSizeSpinner.set_increments(.5, 1);
        thumbnailSizeSpinner.set_size_request(120, -1);
        thumbnailSizeSpinner.connect('value-changed', Lang.bind(this, function(button) {
            let s = button.get_value() / 100;
            this.settings.set_double('thumbnail-size', s);
        }));
        thumbnailSizeSpinner.connect('output', function(button, data) {
            var val = button.get_value().toFixed(1);
            button.set_text(val + "%");
            return true;
        });

        // Add to layout
        let customizeThumbnailControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        let customizeThumbnailContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 10
        });
        customizeThumbnailControlGrid.attach(customizeThumbnailLabel, 0, 0, 1, 1);
        customizeThumbnailControlGrid.attach(customizeThumbnailSwitch, 1, 0, 1, 1);
        customizeThumbnailContainerGrid.attach(thumbnailSizeLabel, 0, 0, 1, 1);
        customizeThumbnailContainerGrid.attach(thumbnailSizeSpinner, 1, 0, 1, 1);

        // Bind interactions
        this.settings.bind('customize-thumbnail', customizeThumbnailContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* TITLE: THUMBNAIL CAPTIONS */

        let workspaceCaptionsTitle = new Gtk.Label({
            label: _("<b>Thumbnail Captions</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });

        let icon_previous, icon_next;
        if (this._rtl) {
            icon_previous = "go-next";
            icon_next = "go-previous";
        } else {
            icon_previous = "go-previous";
            icon_next = "go-next";
        }


        /* THUMBNAIL CAPTIONS WIDGETS */

        let workspaceCaptionsLabel = new Gtk.Label({
            label: _("Add captions to workspace thumbnails"),
            xalign: 0,
            hexpand: true,
            margin_left: 0
        });

        let workspaceCaptionsSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END
        });
        workspaceCaptionsSwitch.set_active(this.settings.get_boolean('workspace-captions'));
        workspaceCaptionsSwitch.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('workspace-captions', check.get_active());
        }));

        // Workspace Captions - Height
        let wsCaptionHeightLabel = new Gtk.Label({
            label: _("Caption height [px]"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let wsCaptionHeightSpinner = new Gtk.SpinButton({
            halign: Gtk.Align.END,
            margin_top: 0
        });
        wsCaptionHeightSpinner.set_sensitive(true);
        wsCaptionHeightSpinner.set_range(10, 50);
        wsCaptionHeightSpinner.set_value(this.settings.get_double("workspace-caption-height") * 1);
        wsCaptionHeightSpinner.set_increments(1, 5);
        wsCaptionHeightSpinner.connect("value-changed", Lang.bind(this, function(button) {
            let s = button.get_value_as_int() / 1;
            this.settings.set_double("workspace-caption-height", s);
        }));

        // Workspace Captions - Window Apps (taskbar) Icon Size
        let wsCaptionWindowAppsIconSizeLabel = new Gtk.Label({
            label: _("Taskbar icon size [px]"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let wsCaptionWindowAppsIconSizeSpinner = new Gtk.SpinButton({
            halign: Gtk.Align.END,
            margin_top: 0,
            margin_bottom: 0
        });
        wsCaptionWindowAppsIconSizeSpinner.set_sensitive(true);
        wsCaptionWindowAppsIconSizeSpinner.set_range(10, 50);
        wsCaptionWindowAppsIconSizeSpinner.set_value(this.settings.get_double("workspace-caption-taskbar-icon-size") * 1);
        wsCaptionWindowAppsIconSizeSpinner.set_increments(1, 5);
        wsCaptionWindowAppsIconSizeSpinner.connect("value-changed", Lang.bind(this, function(button) {
            let s = button.get_value_as_int() / 1;
            this.settings.set_double("workspace-caption-taskbar-icon-size", s);
        }));

        // Workspace captions - Popupmenu Icon Size
        let wsCaptionMenuIconSizeLabel = new Gtk.Label({
            label: _("Caption popup menu icon size [px]"),
            use_markup: true,
            xalign: 0,
            margin_top: 0,
            hexpand: true
        });

        let wsCaptionMenuIconSizeSpinner = new Gtk.SpinButton({
            halign: Gtk.Align.END,
            margin_top: 0,
            margin_bottom: 0
        });
        wsCaptionMenuIconSizeSpinner.set_sensitive(true);
        wsCaptionMenuIconSizeSpinner.set_range(10, 50);
        wsCaptionMenuIconSizeSpinner.set_value(this.settings.get_double("workspace-caption-menu-icon-size") * 1);
        wsCaptionMenuIconSizeSpinner.set_increments(1, 5);
        wsCaptionMenuIconSizeSpinner.connect("value-changed", Lang.bind(this, function(button) {
            let s = button.get_value_as_int() / 1;
            this.settings.set_double("workspace-caption-menu-icon-size", s);
        }));


        /* CAPTION ITEMS WIDGETS */

        let workspaceCaptionItemsTitle = new Gtk.Label({
            label: _("<b>Caption Items</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 5,
            margin_bottom: 5
        });

        // Workspace Captions - Number
        let wsCaptionNumberButton =  new Gtk.CheckButton({
            label: _("Show workspace number"),
            hexpand: true
        });
        wsCaptionNumberButton.set_active(this._getItemExists('number'));
        wsCaptionNumberButton.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) {
                this._addItem('number', wsCaptionNumberExpand.get_active());
            } else {
                this._removeItem('number');
            }
        }));
        let wsCaptionNumberExpand =  new Gtk.CheckButton({
            label: _("Expand"),
            hexpand: true
        });

        wsCaptionNumberExpand.set_active(this._getItemExpanded('number'));
        wsCaptionNumberExpand.connect('toggled', Lang.bind(this, function(check){
            this._setItemExpanded('number', check.get_active());
        }));

        let wsCaptionNumber_MoveLeftButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_previous
            })
        });
        wsCaptionNumber_MoveLeftButton.connect('clicked', function(){
            self._moveItem('number', 1);
        });
        let wsCaptionNumber_MoveRightButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_next
            })
        });
        wsCaptionNumber_MoveRightButton.connect('clicked', function(){
            self._moveItem('number', -1);
        });

        // Workspace Captions - Name
        let wsCaptionNameButton =  new Gtk.CheckButton({
            label: _("Show workspace name"),
            hexpand: true
        });
        wsCaptionNameButton.set_active(this._getItemExists('name'));
        wsCaptionNameButton.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) {
                this._addItem('name', wsCaptionNameExpand.get_active());
            } else {
                this._removeItem('name');
            }
        }));

        let wsCaptionNameExpand =  new Gtk.CheckButton({
            label: _("Expand"),
            hexpand: true
        });
        wsCaptionNameExpand.set_active(this._getItemExpanded('name'));
        wsCaptionNameExpand.connect('toggled', Lang.bind(this, function(check){
            this._setItemExpanded('name', check.get_active());
        }));

        let wsCaptionName_MoveLeftButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_previous
            })
        });
        wsCaptionName_MoveLeftButton.connect('clicked', function(){
            self._moveItem('name', 1);
        });
        let wsCaptionName_MoveRightButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_next
            })
        });
        wsCaptionName_MoveRightButton.connect('clicked', function(){
            self._moveItem('name', -1);
        });

        // Workspace Captions - Window Count
        let wsCaptionWindowCount =  new Gtk.CheckButton({
            label: _("Show workspace window count"),
            hexpand: true
        });

        wsCaptionWindowCount.set_active(this._getItemExists('windowcount'));
        wsCaptionWindowCount.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) {
                this._addItem('windowcount', wsCaptionWindowCountExpand.get_active());
            } else {
                this._removeItem('windowcount');
            }
        }));

        let wsCaptionWindowCountUseImage =  new Gtk.CheckButton({
            label: _("Use image"),
            hexpand: true
        });
        wsCaptionWindowCountUseImage.set_active(this.settings.get_boolean('workspace-caption-windowcount-image'));
        wsCaptionWindowCountUseImage.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('workspace-caption-windowcount-image', check.get_active());
        }));

        let wsCaptionWindowCountExpand =  new Gtk.CheckButton({
            label: _("Expand"),
            hexpand: true
        });

        wsCaptionWindowCountExpand.set_active(this._getItemExpanded('windowcount'));
        wsCaptionWindowCountExpand.connect('toggled', Lang.bind(this, function(check){
            this._setItemExpanded('windowcount', check.get_active());
        }));

        let wsCaptionWindowCount_MoveLeftButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_previous
            })
        });
        wsCaptionWindowCount_MoveLeftButton.connect('clicked', function(){
            self._moveItem('windowcount', 1);
        });
        let wsCaptionWindowCount_MoveRightButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_next
            })
        });
        wsCaptionWindowCount_MoveRightButton.connect('clicked', function(){
            self._moveItem('windowcount', -1);
        });

        // Workspace Captions - Window Apps (taskbar)
        let wsCaptionWindowApps =  new Gtk.CheckButton({
            label: _("Show workspace taskbar (apps)"),
            hexpand: true
        });
        wsCaptionWindowApps.set_active(this._getItemExists('windowapps'));
        wsCaptionWindowApps.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) {
                this._addItem('windowapps', wsCaptionWindowAppsExpand.get_active());
            } else {
                this._removeItem('windowapps');
            }
        }));

        let wsCaptionWindowAppsExpand =  new Gtk.CheckButton({
            label: _("Expand"),
            hexpand: true
        });
        wsCaptionWindowAppsExpand.set_active(this._getItemExpanded('windowapps'));
        wsCaptionWindowAppsExpand.connect('toggled', Lang.bind(this, function(check){
            this._setItemExpanded('windowapps', check.get_active());
        }));

        let wsCaptionWindowApps_MoveLeftButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_previous
            })
        });
        wsCaptionWindowApps_MoveLeftButton.connect('clicked', function(){
            self._moveItem('windowapps', 1);
        });
        let wsCaptionWindowApps_MoveRightButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_next
            })
        });
        wsCaptionWindowApps_MoveRightButton.connect('clicked', function(){
            self._moveItem('windowapps', -1);
        });

        // Workspace Captions - Spacer
        let wsCaptionSpacer =  new Gtk.CheckButton({
            label: _("Show a spacer/filler"),
            hexpand: true
        });

        wsCaptionSpacer.set_active(this._getItemExists('spacer'));
        wsCaptionSpacer.connect('toggled', Lang.bind(this, function(check){
            if (check.get_active()) {
                this._addItem('spacer', wsCaptionSpacerExpand.get_active());
            } else {
                this._removeItem('spacer');
            }
        }));

        let wsCaptionSpacerExpand =  new Gtk.CheckButton({
            label: _("Expand"),
            hexpand: true
        });

        wsCaptionSpacerExpand.set_active(this._getItemExpanded('spacer'));
        wsCaptionSpacerExpand.connect('toggled', Lang.bind(this, function(check){
            this._setItemExpanded('spacer', check.get_active());
        }));

        let wsCaptionSpacer_MoveLeftButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_previous
            })
        });
        wsCaptionSpacer_MoveLeftButton.connect('clicked', function(){
            self._moveItem('spacer', 1);
        });
        let wsCaptionSpacer_MoveRightButton = new Gtk.Button({
            image: new Gtk.Image({
                icon_name: icon_next
            })
        });
        wsCaptionSpacer_MoveRightButton.connect('clicked', function(){
            self._moveItem('spacer', -1);
        });

        // Add to layout
        let workspaceCaptionsControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        let workspaceCaptionsContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 10
        });

        workspaceCaptionsControlGrid.attach(workspaceCaptionsLabel, 0, 0, 1, 1);
        workspaceCaptionsControlGrid.attach(workspaceCaptionsSwitch, 1, 0, 1, 1);

        workspaceCaptionsContainerGrid.attach(wsCaptionHeightLabel, 0, 1, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionHeightSpinner, 2, 1, 3, 1);

        workspaceCaptionsContainerGrid.attach(wsCaptionWindowAppsIconSizeLabel, 0, 2, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionWindowAppsIconSizeSpinner, 2, 2, 3, 1);

        workspaceCaptionsContainerGrid.attach(wsCaptionMenuIconSizeLabel, 0, 3, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionMenuIconSizeSpinner, 2, 3, 3, 1);

        workspaceCaptionsContainerGrid.attach(workspaceCaptionItemsTitle, 0, 4, 1, 1);

        workspaceCaptionsContainerGrid.attach(wsCaptionNumberButton, 0, 5, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionNumberExpand, 2, 5, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionNumber_MoveLeftButton, 3, 5, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionNumber_MoveRightButton, 4, 5, 1, 1);

        workspaceCaptionsContainerGrid.attach(wsCaptionNameButton, 0, 6, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionNameExpand, 2, 6, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionName_MoveLeftButton, 3, 6, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionName_MoveRightButton, 4, 6, 1, 1);

        workspaceCaptionsContainerGrid.attach(wsCaptionWindowCount, 0, 7, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionWindowCountUseImage, 1, 7, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionWindowCountExpand, 2, 7, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionWindowCount_MoveLeftButton, 3, 7, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionWindowCount_MoveRightButton, 4, 7, 1, 1);

        workspaceCaptionsContainerGrid.attach(wsCaptionWindowApps, 0, 8, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionWindowAppsExpand, 2, 8, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionWindowApps_MoveLeftButton, 3, 8, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionWindowApps_MoveRightButton, 4, 8, 1, 1);

        workspaceCaptionsContainerGrid.attach(wsCaptionSpacer, 0, 9, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionSpacerExpand, 2, 9, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionSpacer_MoveLeftButton, 3, 9, 1, 1);
        workspaceCaptionsContainerGrid.attach(wsCaptionSpacer_MoveRightButton, 4, 9, 1, 1);

        // Bind interactions
        this.settings.bind('workspace-captions', workspaceCaptionsContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* TITLE: MISC OPTIONS */

        let workspaceOptionsTitle = new Gtk.Label({
            label: _("<b>Miscellaneous Options</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });

        /* MISC OPTIONS WIDGETS */

        let thumbnailCaptionPopupMenuHideShortcutsPanel = new Gtk.CheckButton({
            label: _("Hide the favorite shortcuts panel when a popup menu is shown"),
            margin_left: 0,
            margin_top: 0
        });
        thumbnailCaptionPopupMenuHideShortcutsPanel.set_active(this.settings.get_boolean('thumbnails-popupmenu-hide-shortcuts'));
        thumbnailCaptionPopupMenuHideShortcutsPanel.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('thumbnails-popupmenu-hide-shortcuts', check.get_active());
        }));

        let thumbnailCaptionPopupMenuHideShortcutsPanelNote = new Gtk.Label({
            label: _("NOTE: Only applies when the shortcuts panel is set to inside orientation"),
            xalign: 0,
            margin_left: 25,
            margin_top: 0
        });

        // Add to layout
        let workspaceOptionsControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0,
            margin_bottom: 20
        });
        workspaceOptionsControlGrid.attach(thumbnailCaptionPopupMenuHideShortcutsPanel, 0, 0, 1, 1);
        workspaceOptionsControlGrid.attach(thumbnailCaptionPopupMenuHideShortcutsPanelNote, 0, 1, 1, 1);


        /* ADD TO NOTEBOOK PAGE */
        notebookWorkspacesSettings.add(customizeThumbnailTitle);
        notebookWorkspacesSettings.add(customizeThumbnailControlGrid);
        notebookWorkspacesSettings.add(customizeThumbnailContainerGrid);
        notebookWorkspacesSettings.add(workspaceCaptionsTitle);
        notebookWorkspacesSettings.add(workspaceCaptionsControlGrid);
        notebookWorkspacesSettings.add(workspaceCaptionsContainerGrid);
        // notebookWorkspacesSettings.add(workspaceOptionsTitle);
        // notebookWorkspacesSettings.add(workspaceOptionsControlGrid);
        notebook.append_page(notebookWorkspacesSettings, notebookWorkspacesSettingsTitle);


        /* ================================================*/
        /* NOTEBOOK - FAVORITES SETTINGS PAGE */
        /* ------------------------------------------------*/

        let notebookDashSettings = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_left: 10,
            margin_right: 10
        });

        let notebookDashSettingsTitle = new Gtk.Label({
            label: _("Favorites"),
            use_markup: true,
            xalign: 0
        });


        /* TITLE: FAVORITE SHORTCUTS PANEL */

        let shortcutsPanelTitle = new Gtk.Label({
            label: _("<b>Favorite Shortcuts Panel</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });


        /* SHORTCUTS PANEL WIDGETS */

        let shortcutsPanelLabel = new Gtk.Label({
            label: _("Show a favorite shortcuts panel"),
            xalign: 0,
            hexpand: true,
            margin_top: 0
        });

        let shortcutsPanelSwitch = new Gtk.Switch ({
            halign: Gtk.Align.END,
            margin_top: 0
        });
        shortcutsPanelSwitch.set_active(this.settings.get_boolean('show-shortcuts-panel'));
        shortcutsPanelSwitch.connect('notify::active', Lang.bind(this, function(check) {
            this.settings.set_boolean('show-shortcuts-panel', check.get_active());
        }));

        let shortcutsPanelOrientationLabel = new Gtk.Label({label: _("Shortcuts panel orientation in reference to the thumbnails"),
            hexpand:true,
            xalign:0
        });
        let shortcutsPanelOrientationCombo = new Gtk.ComboBoxText({
            halign:Gtk.Align.END
        });
        shortcutsPanelOrientationCombo.append_text(_('Outside'));
        shortcutsPanelOrientationCombo.append_text(_('Inside'));

        let orientation = this.settings.get_enum('shortcuts-panel-orientation');
        if (orientation > 1)
            orientation = 0;

        shortcutsPanelOrientationCombo.set_active(orientation);
        shortcutsPanelOrientationCombo.connect('changed', Lang.bind (this, function(widget) {
            this.settings.set_enum('shortcuts-panel-orientation', widget.get_active());
        }));

        let shortcutsPanelIconSizeLabel = new Gtk.Label({
            label: _("Shortcuts panel icon size [px]"),
            use_markup: true,
            xalign: 0,
            hexpand: true
        });

        let shortcutsPanelIconSizeSpinner = new Gtk.SpinButton({
            halign: Gtk.Align.END,
            margin_top: 0,
            margin_bottom: 0
        });
        shortcutsPanelIconSizeSpinner.set_sensitive(true);
        shortcutsPanelIconSizeSpinner.set_range(12, 64);
        shortcutsPanelIconSizeSpinner.set_value(this.settings.get_double("shortcuts-panel-icon-size") * 1);
        shortcutsPanelIconSizeSpinner.set_increments(1, 5);
        shortcutsPanelIconSizeSpinner.connect("value-changed", Lang.bind(this, function(button) {
            let s = button.get_value_as_int() / 1;
            this.settings.set_double("shortcuts-panel-icon-size", s);
        }));

        let setSwarmAnimationButton = new Gtk.CheckButton({
            label: _("Use the Apps button as the source of the swarm animation"),
            margin_left: 0,
            margin_top: 0
        });
        setSwarmAnimationButton.set_active(this.settings.get_boolean('shortcuts-panel-appsbutton-animation'));
        setSwarmAnimationButton.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-appsbutton-animation', check.get_active());
        }));


        /* TITLE: MISC OPTIONS */

        let shortcutsPanelOptionsTitle = new Gtk.Label({
            label: _("<b>Miscellaneous Options</b>"),
            use_markup: true,
            xalign: 0,
            margin_top: 15,
            margin_bottom: 5
        });


        /* MISC OPTIONS WIDGETS */

        let shortcutsPanelShowRunning = new Gtk.CheckButton({
            label: _("Show running applications"),
            margin_left: 0,
            margin_top: 0
        });
        shortcutsPanelShowRunning.set_active(this.settings.get_boolean('shortcuts-panel-show-running'));
        shortcutsPanelShowRunning.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-show-running', check.get_active());
        }));

        let shortcutsPanelShowPlaces = new Gtk.CheckButton({
            label: _("Show places"),
            margin_left: 0,
            margin_top: 0
        });
        shortcutsPanelShowPlaces.set_active(this.settings.get_boolean('shortcuts-panel-show-places'));
        shortcutsPanelShowPlaces.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-show-places', check.get_active());
        }));

        let shortcutsPanelShowWindowCount = new Gtk.CheckButton({
            label: _("Show application window count indicators"),
            margin_left: 0,
            margin_top: 0
        });
        shortcutsPanelShowWindowCount.set_active(this.settings.get_boolean('shortcuts-panel-show-window-count-indicators'));
        shortcutsPanelShowWindowCount.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-show-window-count-indicators', check.get_active());
        }));

        let shortcutsPanelAppsbuttonAtBottom = new Gtk.CheckButton({
            label: _("Set the Apps button at the bottom"),
            margin_left: 0,
            margin_top: 0
        });
        shortcutsPanelAppsbuttonAtBottom.set_active(this.settings.get_boolean('shortcuts-panel-appsbutton-at-bottom'));
        shortcutsPanelAppsbuttonAtBottom.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-appsbutton-at-bottom', check.get_active());
        }));

        let shortcutsPanelPopupMenuArrowAtTop = new Gtk.CheckButton({
            label: _("Set the menu context arrow at the top of the popup menu dialog"),
            margin_left: 0,
            margin_top: 0
        });
        shortcutsPanelPopupMenuArrowAtTop.set_active(this.settings.get_boolean('shortcuts-panel-popupmenu-arrow-at-top'));
        shortcutsPanelPopupMenuArrowAtTop.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-popupmenu-arrow-at-top', check.get_active());
        }));

        let shortcutsPanelPopupMenuHideThumbnails = new Gtk.CheckButton({
            label: _("Hide thumbnails when a popup menu dialog is shown"),
            margin_left: 0,
            margin_top: 0
        });
        shortcutsPanelPopupMenuHideThumbnails.set_active(this.settings.get_boolean('shortcuts-panel-popupmenu-hide-thumbnails'));
        shortcutsPanelPopupMenuHideThumbnails.connect('toggled', Lang.bind(this, function(check) {
            this.settings.set_boolean('shortcuts-panel-popupmenu-hide-thumbnails', check.get_active());
        }));

        let shortcutsPanelPopupMenuHideThumbnailsNote = new Gtk.Label({
            label: _("NOTE: Only applies when the shortcuts panel is set to outside orientation"),
            use_markup: true,
            xalign: 0,
            margin_left: 25,
            margin_top: 0
        });

        // Add to layout
        let shortcutsPanelControlGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 0
        });
        let shortcutsPanelContainerGrid = new Gtk.Grid({
            row_homogeneous: false,
            column_homogeneous: false,
            margin_top: 0,
            margin_left: 10,
            margin_bottom: 10
        });
        shortcutsPanelControlGrid.attach(shortcutsPanelLabel, 0, 1, 1, 1);
        shortcutsPanelControlGrid.attach(shortcutsPanelSwitch, 1, 1, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelOrientationLabel, 0, 0, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelOrientationCombo, 1, 0, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelIconSizeLabel, 0, 1, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelIconSizeSpinner, 1, 1, 1, 1);
        shortcutsPanelContainerGrid.attach(setSwarmAnimationButton, 0, 2, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelOptionsTitle, 0, 3, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelShowRunning, 0, 4, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelShowPlaces, 0, 5, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelShowWindowCount, 0, 6, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelAppsbuttonAtBottom, 0, 7, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelPopupMenuArrowAtTop, 0, 8, 1, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelPopupMenuHideThumbnails, 0, 9, 2, 1);
        shortcutsPanelContainerGrid.attach(shortcutsPanelPopupMenuHideThumbnailsNote, 0, 10, 2, 1);

        // Bind interactions
        this.settings.bind('show-shortcuts-panel', shortcutsPanelContainerGrid, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        /* ADD TO NOTEBOOK PAGE */
        notebookDashSettings.add(shortcutsPanelTitle);
        notebookDashSettings.add(shortcutsPanelControlGrid);
        notebookDashSettings.add(shortcutsPanelContainerGrid);
        notebook.append_page(notebookDashSettings, notebookDashSettingsTitle);



        this.add(notebook);

    },

    _getItemExists: function(item) {
        let currentItems = this.settings.get_strv('workspace-caption-items');
        let items = currentItems.map(function(el) {
            return el.split(':')[0];
        });

        let index = items.indexOf(item);

        if (index == -1)
            return false;

        return true;
    },

    _getItemExpanded: function(item) {
        let currentItems = this.settings.get_strv('workspace-caption-items');
        let items = currentItems.map(function(el) {
            return el.split(':')[0];
        });

        let index = items.indexOf(item);

        if (index == -1)
            return false;

        let currentItem = currentItems[index];
        let expandState = currentItem.split(':')[1];

        if (expandState == "false")
            return false

        return true;
    },

    _setItemExpanded: function(item, expandState) {
        let currentItems = this.settings.get_strv('workspace-caption-items');
        let items = currentItems.map(function(el) {
            return el.split(':')[0];
        });

        let index = items.indexOf(item);

        if (index == -1)
            return false;

        currentItems[index] = item + ":" + expandState;
        this.settings.set_strv('workspace-caption-items', currentItems);
        return true;
    },

    _addItem: function(item, expandState) {
        let currentItems = this.settings.get_strv('workspace-caption-items');
        let items = currentItems.map(function(el) {
            return el.split(':')[0];
        });

        let index = items.indexOf(item);

        if (index != -1)
            return false;

        let newitem = item + ":" + expandState;

        currentItems.push(newitem);
        this.settings.set_strv('workspace-caption-items', currentItems);
        return true;
    },

    _removeItem: function(item) {
        let currentItems = this.settings.get_strv('workspace-caption-items');
        let items = currentItems.map(function(el) {
            return el.split(':')[0];
        });

        let index = items.indexOf(item);

        if (index < 0)
            return false;

        currentItems.splice(index, 1);
        this.settings.set_strv('workspace-caption-items', currentItems);
        return true;
    },

    _moveItem: function(item, delta) {
        let currentItems = this.settings.get_strv('workspace-caption-items');
        let items = currentItems.map(function(el) {
            return el.split(':')[0];
        });

        let index = items.indexOf(item);

        if (index < 0)
            return false;

        let newIndex = index + delta;
        if (newIndex < 0 || newIndex >= currentItems.length || newIndex == index) {
            return false;
        }

        currentItems.splice(newIndex, 0, currentItems.splice(index, 1)[0]);
        this.settings.set_strv('workspace-caption-items', currentItems);
        return true;
    }
});

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let widget = new WorkspacesToDockPreferencesWidget({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 5,
        border_width: 5
    });
    widget.show_all();

    return widget;
}
