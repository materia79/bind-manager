# Controller Definitions

Controller definitions go here. This is where you can add new controller profiles, or edit existing ones. See the code comments for instructions on how to add a new profile.

# Update process (todo)

There is an npm command `process_controller_defs` starting `node scripts/process-controller-defs.js` which goes through all the profiles that lay in the folder ./captures/. It will read the .json files, and convert them to .js files inside ./profiles/ that export the profile data as a JS object. This is necessary because the profiles need to be imported into the browser, and JSON files can't be imported directly.

These profiles will be load at runtime and used to provide exact button and axis labels for controllers that match the profile, instead of generic "Button 0", "Axis 1" labels. The profiles will be matched based on the gamepad's id string, which is provided by the browser's Gamepad API.

The profiles should be used if a user is using a controller with matching properties otherwise the bind manager should fall back to a generic profile that provides basic labels based on the type of control (button, axis, hat). The profiles can also provide a "family" property which can be used to group similar controllers together and provide more general labels for controllers that don't have a specific profile but belong to a known family. For example, an Xbox One controller and an Xbox Series X controller might have different profiles with exact labels, but they could both belong to the "Xbox" family and use the same generic labels if an exact match isn't found.

So when the user is using a controller, the bind manager will try to find an exact match for the controller's id in the loaded profiles. If it finds a match, it will use the labels from that profile. If it doesn't find an exact match, it will check if the controller belongs to a known family and use the generic labels for that family. If it doesn't find a family match either, it will fall back to the most basic generic profile that provides labels like "Button 0", "Axis 1", etc.

If the user is using the Bind Manager to bind a button the Bind Manager should use the data from the current profile to display the button labels in the UI. For example, if the user is using an Xbox controller and the profile for that controller has a label for "Button 0" as "A", then when the user goes to bind an action to "Button 0", the Bind Manager should display "A" as the label for that button in the UI.

Using the Controller Test in the demo page should also show the labels from the profile for the connected controller, allowing you to verify that the profiles are working correctly and that the labels are being applied as expected.

Eventually it would be nice to offer a controller profile selection dropdown in the Bind Manager modal for users to manually select their controller profile if the automatic matching doesn't work correctly, but for now the profiles will just be matched automatically based on the controller's id string.
