const pdf = require('pdf-parse');
console.log('Type of pdf:', typeof pdf);
if (typeof pdf === 'function') {
    console.log('Success: pdf is a function');
} else {
    console.log('Failure: pdf is not a function. Keys:', Object.keys(pdf));
}
