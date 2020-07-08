//jshint esversion:6
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const findOrCreate = require('mongoose-findorcreate');

const app = express();

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());


// Connect to the database
mongoose.connect(`mongodb+srv://admin-andre:${process.env.DB_PASSWORD}@cluster0.lqnqa.mongodb.net/userDB`, { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.set('useCreateIndex', true);

// Mongoose Schema
const userSchema = new mongoose.Schema({
  email: {type: String, require: true, index: true, unique: true, sparse:true},
  password: {type: String, require: true},
  googleId: String,
  facebookId: String,
  secret: [String]
});

// Add the passport local mongoose and the findOrCreate plugins to the Schema
userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

// Mongoose Model
const User = new mongoose.model('User', userSchema);

// passport: creating a local strategy; serialize and deserialize users
passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/google/secrets',
    userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ googleId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: 'http://localhost:3000/auth/facebook/secrets'
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ facebookId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

//////// ROUTES ///////////////

app.get('/', (req, res) => {
  res.render('home');
});

app.get("/auth/google",
  passport.authenticate('google', { scope: ["profile"] })
);

app.get('/auth/google/secrets',
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect to the secrets page.
    res.redirect('/secrets');
  });

app.get('/auth/facebook',
  passport.authenticate('facebook'));

app.get('/auth/facebook/secrets',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/secrets');
  });

app.route('/login')
  .get((req, res) => {
    res.render('login');
  })
  .post((req, res) => {
    const user = new User({
      username: req.body.username,
      password: req.body.password
    });
    req.login(user, err => {
      if (err) console.log(err);
      else passport.authenticate("local", {failureRedirect: '/login'})(req, res, function() {
        res.redirect("/secrets");
      });
    });
  });

app.route('/register')
  .get((req, res) => {
    res.render('register');
  })
  .post((req, res) => {
    User.register({username: req.body.username}, req.body.password, function(err, user) {
      if (err) {
        console.log(err);
        res.redirect('/register');
      } else {
        passport.authenticate('local')(req, res, function() {
          res.redirect('/secrets');
        });
      }
    });
  });

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

app.get('/secrets', (req, res) => {
  User.find({'secret': {$ne: null}}, (err, foundUsers) => {
    if (err) console.log(err);
    else {
      if (foundUsers) res.render('secrets', {usersWithSecrets: foundUsers});
    }
  })
});

app.route('/submit')
  .get((req, res) => {
    if (req.isAuthenticated()) res.render('submit');
    else res.redirect('/login');
  })
  .post((req, res) => {
    const submittedSecret = req.body.secret;

    User.findById(req.user.id, (err, foundUser) => {
      if (err) console.log(err);
      else {
        if (foundUser) {
          foundUser.secret.push(submittedSecret.slice(0, 299));
          foundUser.save(() => res.redirect("/secrets"));
        }
      }
    });
  });


///// SET UP THE SERVER ON PORT 3000 ////////
app.listen(3000, _ => console.log('Server is running on port 3000.'));
