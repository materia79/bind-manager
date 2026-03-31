# Bind Manager

## Features for the initial release (including the above)

Bind Manager is a helper utility for key bindings in browser games. It should offer a Modal popup where the user can define key bindings for varions actions that have to be registered by the game/application. Registered actions can have groups and different type of input types (keyboard, mouse, gamepad). For now we will focus on keyboard input only. The game/application can define how many key bindings are allowed per action (usually two) and the utility should offer a way to reset the key bindings to default. Registering a key binding could include the default key as well. For that it would be good to have a list of key names for keyboard input like "W", "A", "S", "D", "Space", "Shift", etc. On key binding registration from the app/game there should be an argument for a group name like "Movement" and a description, what the key bind is actually doing like "Move forward". Registering a key binding could return an object which would offer functions to turn hints at the bottom of the screen for that particular action on and off. The utility should also offer a way to listen for changes in the key bindings so that the game/app can react to it. For example, if the user changes the key binding for "Move forward" from "W" to "Up Arrow", the game/app should be able to update its controls accordingly.

Optional: The Bind Manager could act as the actual input manager for the game/app, meaning that the game/app would query the Bind Manager for the current key bindings and use that information to handle input. This would allow for a more seamless integration of the key binding system into the game/app. The Bind Manager could offer events for when a key is pressed, released, or held down, and the game/app could listen to those events to trigger the appropriate actions. This would also allow for more complex input handling, such as combo moves or context-sensitive actions.

- The utility should also offer a way to reset the key bindings to default.

## Features for the future

- The utility should also offer a way to export and import the key bindings as JSON.
- The utility should also offer a way to turn hints at the bottom of the screen for particular actions on and off.
