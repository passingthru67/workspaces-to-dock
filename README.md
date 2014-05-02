workspaces-to-dock
==================

A Gnome Shell extension that transforms the workspaces of the overview mode into an intellihide dock.  The dock is positioned and sized to maintain tight integration with the Gnome Shell.

![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/Screenshot.png)


Installation:
------------
The easiest way to install Workspaces-to-Dock is from https://extensions.gnome.org/extension/427/workspaces-to-dock/ using your browser.

If you would rather install it manually, download the releases branch on Github (https://github.com/passingthru67/workspaces-to-dock/tree/releases) and locate the appropriate release zip file. The release zip file contains the same non-debug version of the extension as https://extensions.gnome.org. The zip file can be extracted manually to the extensions folder or installed by using Gnome Tweak tool.

    $unzip workspaces-to-dock@passingthru67.gmail.com.zip -d ~/.local/share/gnome-shell/extensions/workspaces-to-dock@passingthru67.gmail.com

or

    Gnome Tweak tool --> Shell Extensions --> Install from zip file --> choose the zip file.

If you're checking out code from the master branch (downloaded as zip or tar.gz), you will find an installation zip file inside with the latest updates and fixes. The version number is 0 signifying it is not a release version. The zip file can be extracted manually to the extensions folder or installed by using the Gnome Tweak tool as described above.


The extension can be configured using `gnome-shell-extension-prefs`. No shell restarts are required.


Behavior Settings:
------------------

![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/Prefs-Behavior.png)

- **Visibility:**

    **Dock is fixed and always visible** - The dock remains visible at all times.

    **Animation time** - The time it takes the dock to slide from hidden to visible state and vise versa.

    **Show delay** - The time delayed before sliding the dock to the visible state. Adjusting this delay higher (500ms-700ms) can help prevent accidentally triggering the dock when using vertical scroll bars on maximized windows.

    **Hide delay** - The time delayed before sliding the dock to the hidden state.

    **Leave the dock edge visible when slid out** - Option to leave the dock edge visible when in the slid out or hidden state. This option makes the dock more easily accessible in dual monitor configurations where the second monitor is to the right.

    **Disable scroll to prevent workspace switching when slid out** - Option to disable mouse scrolling to prevent accidentally switching workspaces when the dock is hidden.

    **Autohide : Show the dock on mouse hover** - When enabled, the dock shows when the mouse touches the right edge of screen. When disabled, the dock remains hidden unless the intellihide option is on or overview mode is entered.

    **Require pressure to show the dock** - Require mouse pressure against the edge of the screen to show the dock. This option helps eliminate accidentally triggering the dock when using vertical scroll bars. It also helps with accessing the dock in multi-monitor configurations where the 2nd monitor is to the right of the dock. Unfortunately, this feature requires Gnome Shell 3.8+ and an XServer installation that implements pressure barriers.

    NOTE: In multi-monitor configurations where the 2nd monitor is to the right of the workspaces dock, the dock will have to be showing before the pressure barrier is removed and the mouse pointer released to access the 2nd monitor. This will create a slight hesitation as the mouse must wait for the dock to show. To elliminate this issue, you may show the dock using the keyboard shortcut Super + w, or by entering Gnome Shell's overview mode prior to attempting to access the 2nd monitor.

    **Pressure threshold** - The amount of pressure required to activate and show the dock. This setting works in conjunction with 'Require pressure to show dock' above and requires Gnome Shell 3.8+ and an XServer installation that implements pressure barriers.

    **Intellihide : Show the dock unless a window overlaps** - When enabled, the dock remains visible but hides itself when a window touches it. When disabled, dock remains hidden unless the autohide option is on or overview mode is entered.

    **Dodge all windows** - Intellihide option to dodge all windows.

    **Dodge all instances of focused app** - If multiple instances of the focused application are opened, all windows of that app are dodged.

    **Dodge only top instance of focused app** - If multiple instances of the focused application are opened, only the top instance window is dodged.

    **Toggle the dock with a keyboard shortcut** - When enabled, using the keyboard shortcut will toggle the workspaces dock. The default shortcut key is Super + w.


Appearance Settings:
--------------------

![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/Prefs-Appearance.png)

- **Background:**

    **Customize the dock background opacity** - Allows setting a different transparency value for the dock.

    **Opacity** - Percentage of transparency desired.

    **Only when the dock is shown by autohide** - Only customize the opacity when the dock is shown by the mouse touching the right edge of the screen. In such cases, the dock is usually shown over other windows so that less transparency is desired.

- **Position:**

    **Show the dock on the following monitor (if attached)** - Option to position the workspaces dock on a secondary monitor in dual monitor configurations.

- **Height:**

    **Extend the height of the dock to fill the screen** - Option to extend the height of the dock to fill the screen.

    **Top margin** - Allows setting a top margin for the extended dock. The range allowed is 0% to 25% of the screen height.

    **Bottom margin** - Allows setting a bottom margin for the extended dock. The range allowed is 0% to 25% of the screen height.

- **Thumbnails:**

    **Customize the workspace thumbnail size** - Option to customize the maximum thumbnail size.

    **Thumbnail size** - The custom value for the maximum thumbnail size. The range allowed is 10% to 25% of the screen size.


Additional Settings:
--------------------

![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/Prefs-Additional.png)

- **Workspace Captions:**

    **Add captions to workspace thumbnails** - Adds captions to the workspace thumbnails. Right clicking on the workspace caption displays a popup menu with options to close applications or show the extension preferences dialog. (See image below)

![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/Popup.png)

- **Caption Items:**

    **Show workspace number** - When enabled, the workspace number is shown in the caption. It can be expanded to take up available space or its position can be adjusted using the arrow buttons.

    **Show workspace name** - When enabled, the workspace name is shown in the caption. It can be expanded to take up available space or its position can be adjusted using the arrow buttons. Workspace names can be edited using the Workspace Indicator extension. We hope to provide this ability in a future release.

    **Show workspace window count** - When enabled, the workspace window count is shown in the caption. It can be expanded to take up available space or its position can be adjusted using the arrow buttons. There is also an option to use images in place of numeric text.

    **Show workspace taskbar (apps)** - When enabled, the workspace taskbar is shown in the caption. The taskbar displays the icons of applications running on the workspace. It can be expanded to take up available space or its position can be adjusted using the arrow buttons. There is also an option to use large app icons. When the taskbar app icon is left-clicked, the application is brought into focus or minimized if it's already in focus. Right-clicking will bring up the caption popup menu shown above.

    **Show a spacer/filler** - When enabled, a spacer is inserted in the caption. It can be expanded to take up available space or its position can be adjusted using the arrow buttons.

Below are examples of the workspace (thumbnail) caption in various configurations
![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/Thumbnails.png)

- **Custom Actions:**

    **Toggle Gnome Shell's overview mode with right click** - When enabled, right clicking on the dock will toggle the overview mode.

- **Dash Integration:**

    **Show the dock when hovering over Dash-To-Dock extension** - When enabled, hovering the mouse over the Dash-To-Dock extension will cause the workspaces dock to show. This feature is extremely useful in cases where your workspaces dock is hidden and you want to open a new app from the dash. Rather than going into overview just to see your workspaces, hover over the dash-to-dock extension. The workspaces dock will show to the right. Use the dash-to-dock scroll to go to the appropriate workspace.


Workspace Caption Theming:
-------------------------
Adding workspaces-to-dock caption support to a theme can be accomplished by placing a custom 'workspaces-to-dock.css' stylesheet in the theme's gnome-shell/extensions/ folder. There is no need to use the @import directive to incorporate the stylesheet classes into your theme's gnome-shell.css. The extension will automatically detect the stylesheet file. Please see the workspaces-to-dock.css stylesheet for a description of the css classes.


Localization Support:
--------------------
Support for languages is now provided with the editable translation files being located in the po folder of the repository. If you would like to help with translations, please download one of the po files (en_US.po serves as a clean template) and email your translation to me at passingthru67@gmail.com.


Features Planned:
-----------------
- Editing the workspace caption name.
- Favorites panel.


Known Issues:
-------------
- **`FIXED in version 11`** Dual monitor configurations where 2nd monitor is on the right side - workspaces-to-dock prevents mouse clicks from reaching the desktop of the right monitor in the region where the dock is slid out (even though the dock is hidden there is a dead zone). A workaround (other than positioning the dock on the secondary monitor) is to enable application based intellihide using the workspaces-to-dock extension preferences.
- Dual monitor configurations where workspaces-to-dock is positioned on the 2nd monitor, the dock overlaps window thumbnails when in overview mode.
- Changes to Gsetting's dynamic workspaces setting or number of static workspaces requires a restart of the workspaces-to-dock extension.

**Some causes of strange dynamic workspace behavior:**

- Letting Nautilus file manager handle the desktop  (this is an option in Gnome Tweak Tool).
- Using a dual monitor configuration with the workspaces-only-on-primary option under org->gnome->shell->overrides turned on.


Extensions That Cause Conflicts:
--------------------------------
- **Frippery Bottom Panel** - causes workspace scrolling issues
- **Native Window Placement** - causes overlapping of window thumbnails in overview mode
- **Workspace Grid** - causes overlapping of window thumbnails in overview mode


Bug Reporting:
--------------
If you run into any problelms with the extension, try resetting the extension to its default settings and restart Gnome Shell.  Test again to see if the behavior can be replicated.

To reset the extension to its default settings, type the command below in a terminal.

    $ dconf reset -f /org/gnome/shell/extensions/workspaces-to-dock/

If the behavior persists, try disabling all other extensions and enable each extension one at a time until the behavior reappears. You may be experiencing a conflict with another extension.

If the behavior persists with other extensions disabled, check for extension errors in Looking Glass (Gnome Shell 3.4) or by typing gnome-shell --replace in a terminal and watching for JS error logs related to the extension.

If the problem persists, please report it by opening an issue on github or with a bug report message on the extension website.


Change Log:
-----------
**version 19 (Gnome 3.10), version 20 (Gnome 3.12) (May 1, 2014)**

- Behavior updated to be more consistant with Gnome Shell 3.10+
- Better support for multi-monitor setups
- Better taskbar app tracking over workspaces
- Option to customize the caption taskbar and icon sizes
- Bug fixes

**version 18 for Gnome 3.12 (Mar 16, 2014)**

- Support for Gnome Shell 3.12

**version 17 (Feb 21, 2014)**

- Bug fix (Gnome Shell 3.6)

**version 16 (Jan 20, 2014)**

- Option to disable mouse scroll when dock is hidden (feature)
- Bug fixes

**version 15 (Oct 20, 2013)**

- Support for Gnome Shell 3.10.1

**version 14 (Oct 14, 2013)**

- Support for Gnome Shell 3.10
- Reimplemented custom theme auto-detection
- Enhancements to Dash integration and thumbnail captions
- Bug fixes

**version 13 (Sept 7, 2013)**

- Big fixes (before version 12 review completed)

**version 12 (Sept 3, 2013)**

- RTL support added
- Option to require mouse pressure to activate and show dock (feature)
- Option to customize the thumbnail size (feature)
- Ability to use keyboard shortcut to toggle dock (feature)
- Redesigned preferences window
- Bug fixes

**version 11 (Apr 19, 2013)**

- Support for Gnome Shell 3.8
- Option to display workspace taskbar (app icons) in the caption (feature)
- Option to require mouse click (in addition to hovering) to show dock when focused window is maximized (feature)
- Option to leave the dock edge visible when slid out (feature)
- Bug fixes for longstanding issues with dual monitor configurations

**version 10 (Feb 27, 2013)**

- Removed auto detection of user theme support (buggy?)

**version 9 (Feb 25, 2013)**

- Language support added
- Auto detect if user theme supports workspaces-to-dock (feature)
- Option to extend dock height to fill the screen (feature)
- Bug fixes

**version 8 (Jan 26, 2013)**

- Option to display workspace thumbnail captions (feature)
- Ability to toggle overview mode with right click (feature)
- Another intellihide option for dodging the top instance of an application (feature)
- Ability to position the dock on secondary monitors (feature)
- Bug fixes

**version 7 (Nov 3, 2012)**

- Bug fixes
- Show workspaces dock on Dash-To-Dock hover (feature)

    Dash-To-Dock hover shows the workspaces dock when hovering over the dash-to-dock extension (if you've got it installed).
    Extremely useful in cases where your workspaces dock is hidden and you want to open a new app from the dash. Rather than going into overview just to see your workspaces, hover over the dash-to-dock extension. The workspaces dock will show to the right. Use the dash-to-dock scroll to go to the appropriate workspace.

**version 6 (Oct 26, 2012)**

- Support for Gnome Shell 3.6 and new lock screen
- Better support for static workspaces
- Application based intellihide (feature)
- Bug fixes

    **NOTE: Changes to Gsetting's dynamic workspaces setting or number of static workspaces requires a restart of the workspaces-to-dock extension**

**version 5 (Sept 11, 2012)**

- Bug fixes

**version 4 (Sept 6, 2012)**

- Better stationary/fixed dock support.
- Intellihide enhancements to dodge Gnome Shell panel menus after initialization.
- Bug fixes

**version 3 (Aug 31, 2012)**

- Reworked the code for adding/removing workspaces. Not only fixed the firefox issue, but also made displaying workspaces smoother and more consistant with Gnome Shell behavior.
- Intellihide enhancement to dodge resulting icons from Gnome Shell search panel.

**version 2 (Aug 28, 2012)**

- Scrolling the mouse wheel over the dock now switches workspaces.
- Intellihide enhancements to dodge Gnome Shell panel and messsagetray popup menus.

**version 1 (Aug 15, 2012)**

- Initial extension based on the dash-to-dock v10 code (https://github.com/micheleg/dash-to-dock).

