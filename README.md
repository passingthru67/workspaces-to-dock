workspaces-to-dock
==================

A Gnome Shell extension that transforms the workspaces of the overview mode into an intellihide dock.  The dock is positioned and sized to maintain tight integration with the Gnome Shell.

![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/Screenshot.png)


Installation:
------------
The easiest way to install Workspaces-to-Dock is from https://extensions.gnome.org/extension/427/workspaces-to-dock/ using your browser.

If you would rather install it manually, and receive the latest fixes and enhancements, download the master branch zip (https://github.com/passingthru67/workspaces-to-dock/archive/master.zip) and extract it into a temporary folder. Inside of the extracted folder you will find the workspaces-to-dock@passingthru67.gmail folder. Simply copy it to your ~/.local/share/gnome-shell/extensions folder. Next, restart Gnome Shell (alt+f2+r). If Workspaces-to-Dock doesn't show up, you may need to enable the extension using Gnome Tweak tool.

For older releases, download the releases branch on Github (https://github.com/passingthru67/workspaces-to-dock/tree/releases) and locate the appropriate release zip file. The release zip file contains the same non-debug version of the extension as https://extensions.gnome.org. The zip file can be extracted manually to the extensions folder or installed by using Gnome Tweak tool.

    $unzip workspaces-to-dock@passingthru67.gmail.com.zip -d ~/.local/share/gnome-shell/extensions/workspaces-to-dock@passingthru67.gmail.com

or

    Gnome Tweak tool --> Shell Extensions --> Install from zip file --> choose the zip file.


The extension can be configured using `gnome-shell-extension-prefs`. No shell restarts are required.


General Settings:
-----------------

![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/Prefs-General.png)

- **Position:**

    **Show the dock on the following monitor (if attached)** - Option to position the workspaces dock on a secondary monitor in dual monitor configurations.

    **Show the dock at the following screen position** - Option to position the workspaces dock on the right or left side of the screen.

    **Hide the Gnome Shell Dash** - Option to hide the default Dash in overview mode.

- **Height:**

    **Customize the height of the dock** - Option to autosize or extend the height of the dock.

    **Autosize and center the dock based on workspaces and shortcuts** - Option to autosize and center the dock.

    **Extend the height of the dock to fill the screen** - Option to extend the height of the dock to fill the screen.

    **Top margin** - Sets a top margin for the extended dock. The range allowed is 0% to 25% of the screen height.

    **Bottom margin** - Sets a bottom margin for the extended dock. The range allowed is 0% to 25% of the screen height.

- **Background:**

    **Customize the dock background opacity** - Allows setting a different transparency value for the dock.

    **Opacity** - Percentage of transparency desired.

    **Toggle Gnome Shell's overview mode with right click** - When enabled, right clicking on the dock will toggle the overview mode.

    **Prevent multiple workspace switching when using touchpad to scroll - When enabled, scroll events are inhibited to prevent triggering multiple workspace switching. This feature is useful when using a touchpad.


Behavior Settings:
------------------

![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/Prefs-Behavior.png)

- **Intelligent Hiding:**

    **Dock is fixed and always visible. Turn off intelligent hiding** - The dock remains visible at all times. There is no need for intelligent hiding.

    **Timing Options**

    **Animation time** - The time it takes the dock to slide from hidden to visible state and vise versa.

    **Show delay** - The time delayed before sliding the dock to the visible state. Adjusting this delay higher (500ms-700ms) can help prevent accidentally triggering the dock when using vertical scroll bars on maximized windows.

    **Hide delay** - The time delayed before sliding the dock to the hidden state.

    **Autohide Options**

    **Autohide : Show the dock on mouse hover** - When enabled, the dock shows when the mouse touches the right edge of screen. When disabled, the dock remains hidden unless the intellihide option is on or overview mode is entered.

    **Require pressure to show the dock** - Require mouse pressure against the edge of the screen to show the dock. This option helps eliminate accidentally triggering the dock when using vertical scroll bars. It also helps with accessing the dock in multi-monitor configurations where the 2nd monitor is to the right of the dock. Unfortunately, this feature requires Gnome Shell 3.8+ and an XServer installation that implements pressure barriers.

    **Pressure threshold** - The amount of pressure required to activate and show the dock.

    **Limit pressure sense to slow mouse speeds** - When enabled, this option allows the mouse to pass through the pressure barrier by attacking the edge of the screen with a quick stroke. This allows the mouse to quickly access a second monitor in multi-monitor setups. This setting works in conjunction with 'Require pressure to show dock' above and requires Gnome Shell 3.8+ and an XServer installation that implements pressure barriers.

    **Maximum speed** - The speed limit of the mouse (determined by measuring the pixel distance traveled) that must be reached before the pressure barrier is defeated. The higher the value, the faster the mouse must travel before passing through the barrier.

    NOTE: In multi-monitor configurations where the 2nd monitor is to the right of the workspaces dock, the dock will have to be showing before the pressure barrier is removed and the mouse pointer released to access the 2nd monitor. This will create a slight hesitation as the mouse must wait for the dock to show. To eliminate this issue, you may show the dock using the keyboard shortcut Super + w, or by entering Gnome Shell's overview mode prior to attempting to access the 2nd monitor. A third method is to enable the 'Limit pressure sense to slow mouse speeds' option. This option allows the mouse to pass through the pressure barrier by attacking the edge of the screen with a quick stroke.

    **Intellihide Options**

    **Intellihide : Show the dock unless a window overlaps** - When enabled, the dock remains visible but hides itself when a window touches it. When disabled, dock remains hidden unless the autohide option is on or overview mode is entered.

    **Dodge all windows** - Intellihide option to dodge all windows.

    **Dodge all instances of focused app** - If multiple instances of the focused application are opened, all windows of that app are dodged.

    **Dodge only top instance of focused app** - If multiple instances of the focused application are opened, only the top instance window is dodged.

    **What should we do with the dock when not dodging windows?** - Option for intellihide to show the full dock or show a partial dock when not dodging windows. The dock will fully hide when dodging windows.

	**SHOW-FULL Option** - The Dock is fully shown when not dodging windows. This is the default setting.

    **SHOW-PARTIAL Option** - The Dock is partially shown when not dodging windows. Mouse pressure (if require-pressure-to-show-the-dock is enabled under Autohide Options) or mouse hover will cause the dock to fully show.

    NOTE: When the favorites panel is enabled and oriented inside, the show-partial option shows the favorites panel. Otherwise, a 30px portion (adjustable through the gnome-shell css) of the workspace thumbnails are shown.

    **SHOW-PARTIAL-FIXED Option** - This option allows part of the dock to be visible at all times. Similar to the show-partial option but with a fixed (always visible) element.

	Below are screencasts of the dock partially shown with the favorites panel oriented inside and outside.

    **Show-partial with favorites panel oriented inside**
![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/ShowPartial-Inside.gif)

	**Show-partial with favorites panel oriented outside**
![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/ShowPartial-Outside.gif)

	**Show-partial-fixed with favorites panel oriented inside**
![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/ShowPartial-Fixed.gif)

	In the screencast above, note how the partial dock affects the desktop workspace and remains visible at all times.

	**What should we do with the dock in overview mode?** - Option to show the full dock, hide the dock, or show a partial dock when in overview mode. See the note above regarding the show-partial option.

    **Miscellaneous Options**

    **Leave a visible edge when the dock is hidden** - Option to leave the dock edge visible when in the slid out or hidden state. This option makes the dock more easily accessible in dual monitor configurations where the second monitor is to the right.

    **Disable scroll when the dock is hidden to prevent workspace switching** - Option to disable mouse scrolling to prevent accidentally switching workspaces when the dock is hidden.

    NOTE: Normally, a 1px wide space is present at the edge of the screen for scrolling workspaces. But, this 1px edge may interfere with scrollbars of maximized windows when the dock is positioned on the right of the screen. Enabling the 'Disable scroll when the dock is hidden' option removes the 1px edge so that scrollbars are more easily accessible. 'Require pressure to show the dock' must be enabled and 'Leave a visible edge when the dock is hidden' must be disabled, though, for the 1px wide space to be removed.

    **Show the dock when hovering over Dash-To-Dock extension** - When enabled, hovering the mouse over the Dash-To-Dock extension will cause the workspaces dock to show. This feature is extremely useful in cases where your workspaces dock is hidden and you want to open a new app from the dash. Rather than going into overview just to see your workspaces, hover over the dash-to-dock extension. The workspaces dock will show to the right. Use the dash-to-dock scroll to go to the appropriate workspace.

    **Show the dock temporarily when switching workspaces** - When enabled, the dock will be shown temporarily when switching workspaces. The default length of time shown is 1 second (1000 ms).

    **Toggle the dock with a keyboard shortcut** - When enabled, using the keyboard shortcut will toggle the workspaces dock. The default shortcut key is Super + w.


Thumbnails Settings:
--------------------

![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/Prefs-Thumbnails.png)

- **Thumbnail Size:**

    **Customize the workspace thumbnail size** - Option to customize the maximum thumbnail size.

    **Thumbnail size** - The custom value for the maximum thumbnail size. The range allowed is 10% to 25% of the screen size.

- **Thumbnail Captions:**

    **Add captions to workspace thumbnails** - Adds captions to the workspace thumbnails. Right clicking on the workspace caption displays a popup menu with options to close applications or show the extension preferences dialog. (See image below)

    **Caption height** - Sets the height of the caption area.

    **Taskbar icon size** - Sets the size of the caption taskbar icons.

    **Caption popup menu icon size** - Sets the size of the application icons in the caption popup menu.


![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/Popup.png)

- **Caption Items:**

    **Show workspace number** - When enabled, the workspace number is shown in the caption. It can be expanded to take up available space or its position can be adjusted using the arrow buttons.

    **Show workspace name** - When enabled, the workspace name is shown in the caption. It can be expanded to take up available space or its position can be adjusted using the arrow buttons. Workspace names can be edited using the Workspace Indicator extension. We hope to provide this ability in a future release.

    **Show workspace window count** - When enabled, the workspace window count is shown in the caption. It can be expanded to take up available space or its position can be adjusted using the arrow buttons. There is also an option to use images in place of numeric text.

    **Show workspace taskbar (apps)** - When enabled, the workspace taskbar is shown in the caption. The taskbar displays the icons of applications running on the workspace. It can be expanded to take up available space or its position can be adjusted using the arrow buttons. There is also an option to use large app icons. When the taskbar app icon is left-clicked, the application is brought into focus or minimized if it's already in focus. Right-clicking will bring up the caption popup menu shown above.

    **Show a spacer/filler** - When enabled, a spacer is inserted in the caption. It can be expanded to take up available space or its position can be adjusted using the arrow buttons.

Below are examples of the workspace (thumbnail) caption in various configurations
![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/Thumbnails.png)


Workspace Caption Theming:
-------------------------
Captions may be themed by editing the workspaces-to-dock.css file inside the extension folder, or by including a 'workspaces-to-dock.css' stylesheet inside the theme's gnome-shell/extension folder. For more details on theme support, see the 'Theme Support' section below.


Favorites Settings:
-------------------

![screenshot](https://github.com/passingthru67/workspaces-to-dock/raw/master/Prefs-Favorites.png)

- **Favorite Shortcuts Panel:**

    **Show a favorite shortcuts panel** - Adds a panel of favorite applications.

    **Shortcuts panel orientation in reference to the thumbnails** - Places the favorite shortcuts panel on the inside or outside of the thumbnails.

    **Shortcuts panel icon size** - Sets the size of the application icons.

    **Use the Apps button as the source of the swarm animation** - When enabled, the Apps button will be the source of the swarm animation that displays the apps icon grid in overview mode.

    **Miscellaneous Options**

    **Show running applications** - Option to show running applications on the favorite shortcuts panel.

    **Show places** - Option to show places on the favorite shortcuts panel.

    **Show application window count indicators** - Option to show the number of running instances of an application next to the application icon.

    **Set the Apps button at the bottom** - Option to show the applications button (grid) at the bottom of the favorite shortcuts panel.

    **Set the menu context arrow at the top of the popup menu dialog** - Option to show the popup menu context arrow at the top of the context menu. The default position is in the middle.

    **Hide thumbnails when a popup menu is shown** - Option to hide the thumbnails when a popup menu is show by right clicking a favorite application icon. This only applies when the shortcuts panel is oriented on the outside of the thumbnails.


Theme Support:
-------------------------
Adding workspaces-to-dock support to a theme can be accomplished by placing a custom 'workspaces-to-dock.css' stylesheet in the theme's gnome-shell/extensions folder. There is no need to use the @import directive to incorporate the stylesheet classes into your theme's gnome-shell.css. The extension will automatically detect the stylesheet file. Please see the workspaces-to-dock.css stylesheet for a description of the css classes.


Localization Support:
--------------------
Support for languages is now provided with the editable translation files being located in the po folder of the repository. If you would like to help with translations, please download one of the po files (en_US.po serves as a clean template) and email your translation to me at passingthru67@gmail.com.


Features Planned:
-----------------
- Ability to edit the workspace caption name.
- Making the favorite shortcuts panel scrollable.


Known Issues:
-------------
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

If the behavior persists with other extensions disabled, check for extension errors in the following places.
- Open up Looking Glass (Alt+F2 then type lg and press enter) and check for extension errors under the Extensions link.
- Open your ~/.xsession-errors log and look for errors related to the extension.
- Type "gnome-shell --replace" in a terminal and watch for JS error logs related to the extension.
- Type "journalctl -f" in a terminal (if systemd is installed) and watch for JS error logs related to the extension. Alternately, typing "jurnalctl -b" will show all messages since the last boot.

If the problem persists, please report it by opening an issue on github or with a bug report message on the extension website.


Change Log:
-----------
**Version 39 for Gnome 3.20 (Sep 9, 2016)**
- Added option to show partial dock in normal desktop view
- Added option to place captions at top of thumbnails
- Added extension prefs menu item to favorites panel apps button
- Reorganized preferences dialog
- Bug fixes

**Version 38 for Gnome 3.18 (Sep 8, 2016)**
- Backported fixes and features

**Version 37 for Gnome 3.16 (Sep 7, 2016)**
- Backported fixes and features

**version 36 for Gnome 3.20 (Apr 12, 2016)**
- Support for Gnome 3.20

**version 35 for Gnome 3.14 (Mar 14, 2016)**
- Bug fixes

**version 34 for Gnome 3.18 (Mar 1, 2016)**
- Bug fixes

**version 33 for Gnome 3.16 (Mar 1, 2016)**
- Backported fixes and features

**version 32 for Gnome 3.18 (Feb 5, 2015)**
- Bug fixes
- Added support for positioning the dock at the top or bottom of the screen
- Added option to hide Gnome Shell Dash
- Added option to change source of swarm animation to Apps button
- Added option to autosize and center the dock
- Added option to show, hide, or partially-hide the dock in overview mode
- Added option to temporarily show the dock when switching workspaces
- Added ability to add, remove, and rearrange favorites on shortcuts panel
- Added pressure threshold speed limit for dual monitor setups

**version 31 for Gnome 3.18 (Oct 9, 2015)**
- Support for Gnome 3.18

**version 30 for Gnome 3.16 (Sept 15, 2015)**
- Bug fixes (particularly border issues)
- Added support for moving an application to a different workspace by dragging the tasbar icon
- Added support for positioning the dock on the left or right side of the screen
- Added option for inside or outside orientation of favorite shortcuts panel
- Updated preferences dialog

**version 29 for Gnome 3.16 (May 5, 2015)**
- Bug fixes

**version 28 for Gnome 3.16 (March 30, 2015)**
- Support for Gnome Shell 3.16
- Implement new thumbnails slider

**version 27 for Gnome 3.14 (January 12, 2015)**
- Bug fixes
- Dash-To-Dock bottom position compatibility

**version 26 for Gnome 3.12 (October 8, 2014)**
- Bug fixes

**version 25 for Gnome 3.10 (October 4, 2014)**
- Bug fixes

**version 24 for Gnome 3.14 (October 2, 2014)**
- Bug fixes

**version 23 for Gnome 3.14 (September 27, 2014)**
- Added experimental favorites panel
- Reworked implementation of dock shift when message tray visible
- Refactored code for legibility

**version 22 for Gnome 3.12 (May 20, 2014)**
- Bug fixes

**version 21 for Gnome 3.12 (May 12, 2014)**
- Bug fixes

**version 19 (Gnome 3.10), version 20 (Gnome 3.12) (May 1, 2014)**

- Behavior updated to be more consistent with Gnome Shell 3.10+
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

- Reworked the code for adding/removing workspaces. Not only fixed the firefox issue, but also made displaying workspaces smoother and more consistent with Gnome Shell behavior.
- Intellihide enhancement to dodge resulting icons from Gnome Shell search panel.

**version 2 (Aug 28, 2012)**

- Scrolling the mouse wheel over the dock now switches workspaces.
- Intellihide enhancements to dodge Gnome Shell panel and messsagetray popup menus.

**version 1 (Aug 15, 2012)**

- Initial extension based on the dash-to-dock v10 code (https://github.com/micheleg/dash-to-dock).
