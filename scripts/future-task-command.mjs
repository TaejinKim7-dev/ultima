const [commandName, todoNumber] = process.argv.slice(2)

if (commandName === undefined || todoNumber === undefined) {
  console.error("A future command name and Todo number are required.")
  process.exitCode = 1
} else {
  console.error(`${commandName} is unavailable until Todo ${todoNumber} is implemented.`)
  process.exitCode = 1
}
