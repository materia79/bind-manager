# Controller Definitions

Controller definitions go here. This is where you can add new controller profiles, or edit existing ones. See the code comments for instructions on how to add a new profile.

# Update process

There is an npm command `process_controller_defs` starting `node scripts/process-controller-defs.js` which goes through all the captures in the folder `./captures/`. It reads the `.json` files and converts them to `.js` files inside `./profiles/` that export the profile data as a JS object. This is necessary because the profiles need to be imported into the browser, and JSON files cannot be imported directly by the current runtime.

Current operator workflow:

1. Open the demo and run `Input Debug`.
2. Review the generated JSON, validation output, and suggested filename.
3. Use `Download JSON` and place the file into `src/input/controller_definitions/captures/`.
4. Run `npm run process_controller_defs`.
5. Reconnect the controller and verify labels in the Bind Manager modal, hints, and demo controller tester.

These profiles are loaded at runtime and used to provide exact button and axis labels for controllers that match the profile, instead of generic `Button 0` or `Axis 1` labels. The profiles are matched based on the gamepad's id string, which is provided by the browser's Gamepad API.

These profiles should be used if a user is using a controller with matching properties. Otherwise the Bind Manager falls back to a family or generic profile that provides basic labels based on the type of control (button, axis, hat). The profiles can also provide a `family` property which groups similar controllers together and provides more general labels for controllers that do not have a specific exact profile but belong to a known family.

So when the user is using a controller, the Bind Manager resolves labels in this order:

1. Manual override selected by the user.
2. Exact generated profile matching the controller id.
3. Family fallback labels if the controller belongs to a known family.
4. Generic fallback labels if nothing more specific is available.

If the user is using the Bind Manager to bind a button the Bind Manager should use the data from the current profile to display the button labels in the UI. For example, if the user is using an Xbox controller and the profile for that controller has a label for "Button 0" as "A", then when the user goes to bind an action to "Button 0", the Bind Manager should display "A" as the label for that button in the UI.

Using the Controller Test in the demo page should also show the labels from the profile for the connected controller, allowing you to verify that the profiles are working correctly and that the labels are being applied as expected.

The Bind Manager modal now includes a controller profile selection dropdown so users can manually force an exact or family profile when automatic matching is not correct.
