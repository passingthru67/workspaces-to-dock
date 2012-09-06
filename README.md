workspaces-to-dock
==================

A Gnome Shell extension that transforms the workspaces of the overview mode into an intellihide dock.  The dock is positioned and sized to maintain tight integration with the Gnome Shell.


Installation
------------
The easiest way to install Workspaces-to-Dock is from https://extensions.gnome.org/extension/427/workspaces-to-dock/ using your browser.

If you would rather install it manually, please download the zip file from the downloads section of Github (https://github.com/passingthru67/workspaces-to-dock/downloads). That zip file contains the same version of the extension as https://extensions.gnome.org and can be installed using Gnome Tweak tool.

	Gnome Tweak tool --> Shell Extensions --> Install from zip file --> choose the zip file.

If you're checking out code from the master branch (downloaded as zip or tar.gz), you will need to rename the extracted folder to workspaces-to-dock@passingthru67.gmail.com and manually copy it into your ~/.local/share/gnome-shell/extensions/ folder. I am now including the gschemas.compiled file (compiled xml schema for gsettings) in the master branch so you won't have to compile it manually. 

	$ cp workspaces-to-dock@passingthru67@gmail.com ~/.local/share/gnome-shell/extensions/

Configure using `gnome-shell-extension-prefs`. No shell restarts required.


Features Planned:
-----------------
- RTL support
- Preferences option to choose which monitor to place workspaces dock onto


Issues:
-------

If you run into any strange behavior with dynamic workspaces, please disable the extension, restart Gnome Shell, and test again to see if the behavior can be replicated.

**Some causes of strange workspace behavior:**

- Letting Nautilus file manager handle the desktop  (this is an option in Gnome Tweak Tool).
- Using dual monitors. If you are using dual monitors, it is recommended that you turn off the workspaces-only-on-primary option under org->gnome->shell->overrides (use dconf-editor). Gnome Shell 3.4 seems buggy when using dual monitors in general, but worse with this option on.


Changelog:
----------

versin 4 (Sept 6, 2012)

- Better stationary/fixed dock support.
- Intellihide enhancements to dodge Gnome Shell panel menus added after initializing.

version 3 (Aug 31, 2012)

- Reworked the code for adding/removing workspaces. Not only fixed the firefox issue, but also made displaying workspaces smoother and more consistant with Gnome Shell behavior.
- Intellihide enhancement added to dodge resulting icons from Gnome Shell search panel.

version 2 (Aug 28, 2012)

- Scrolling the mouse wheel over the dock now switches workspaces.
- Intellihide enhancements added to dodge Gnome Shell panel and messsagetray popup menus.

version 1 (Aug 15, 2012)

- Initial extension based on the dash-to-dock v10 code (https://github.com/micheleg/dash-to-dock).

