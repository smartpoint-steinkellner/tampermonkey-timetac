# Tampermonkey TimeTac scripts
The utility project `Tampermonkey TimeTac` contains some javascript scripts to be used with the Google Chrome plugin `Tampermonkey`

## Chrome plugin
https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo

### Settings
the following settings need to be set in order for the plugin to work correctly:
- "Websitezugriff": "Auf bestimmten Websites"
- Add the following sites:
  - https://blacklist.tampermonkey.net/*
  - https://go.timetac.com/*
- "Nutzerscripte zulassen": true

## Script installation
Open any of the javascript files in this repo via browser.  
Copy out the url noted under `// @updateUrl` and paste it into a new tab.  
When Tampermonkey is installed, it should automatically show a popup to install the script.  
If the popup doesn't show up, you can manually create a new script via Tampermonkey options and paste in the complete content of the script you want to install.

## Script updates
Once a script has been installed, Tampermonkey will automatically check periodically for updates.  
Each script contains a version number as part of a header comment.

## Scripts in this repo

