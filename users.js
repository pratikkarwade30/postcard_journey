const express = require("express");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const keys = require('../../config/keys');
const passport = require('passport');
const validateRegisterInput = require('../../validation/register');
const validateLoginInput = require('../../validation/login');

const router = express.Router();
const User = require('../../models/User');
const tripRouter = express.Router({mergeParams: true});
const Trip = require('../../models/Trip');
const upload = require("../../services/ImageUpload");
const deleteImage = require("../../services/imageDelete")

router.use('/:userId/trips', tripRouter)

// router.get("/", async (req, res) => {
//   const users = await User.find();
// })

router.get('/current', passport.authenticate('jwt', {session: false}), (req, res) => {
  res.json({
    id: req.user.id,
    displayName: req.user.displayName,
    email: req.user.email
  });
})

router.post('/register', (req, res) => {
  const { errors, isValid } = validateRegisterInput(req.body);
  if(!isValid){
    return res.status(400).json(errors);
  }

  User.findOne({ email: req.body.email })
    .then((user) => {
      if(user){
        errors.email = 'Email already registered';
        return res.status(400).json(errors);
      } else{
        const newUser = new User({
          displayName: req.body.displayName,
          email: req.body.email,
          password: req.body.password,
          profilePic: null,
          following: []
        })
        newUser.following = newUser.following.concat(newUser.userId);
        
        bcrypt.genSalt(10, (err, salt) => {
          bcrypt.hash(newUser.password, salt, (err, hash) => {
            if(err) throw err;
            newUser.password = hash;
            newUser.save()
            .then(user => {
                const payload = {id: user.id, displayName: user.displayName}
                jwt.sign(
                  payload,
                  keys.secretOrKey,
                  {expiresIn: 86400},
                  (err, token) => {
                    res.json({
                      user,
                      success: true,
                      token: 'Bearer ' + token
                    });
                  }
                );
              })
              .catch(err => console.log(err));
          })
        })
        
      }
    })
})


router.post('/login', (req, res) => {
  const { errors, isValid } = validateLoginInput(req.body);
  if(!isValid){
    return res.status(400).json(errors);
  }

  const email = req.body.email;
  const password = req.body.password;

  User.findOne({email})
    .then((user) => {
      if (!user){
        errors.email = 'User not found';
        return res.status(404).json(errors);
      }
      
      bcrypt.compare(password, user.password)
        .then((isMatch) => {
          if(isMatch){
            const payload = {id: user.id, displayName: user.displayName}
            jwt.sign(
              payload,
              keys.secretOrKey,
              {expiresIn: 86400},
              (err, token) => {
                res.json({
                  user,
                  success: true,
                  token: 'Bearer ' + token
                });
              }
            );
          } else{
            errors.password = 'Incorrect password'
            return res.status(400).json(errors);
          }
        })
    })
})

tripRouter.get('/', async (req, res) => {
  const trips =  await Trip.find({travellerId: req.params.userId}).sort({date: -1});
  const user = await User.findById(req.params.userId);
  const userObj = {
    _id: user.id,
    displayName: user.displayName,
    email: user.email,
    following: user.following,
    profilePic: user.profilePic,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
  const tripsObj = {};
  const pcObj = {};
  for(let i = 0; i < trips.length; i++){
    let trip = trips[i];
    tripsObj[trip.id] = {
      _id: trip.id,
      title: trip.title,
      description: trip.description,
      travellerId: trip.travellerId,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
      __v: trip.__v,
      travellerName: user.displayName
    };
    let postcards = await Postcard.find({tripId: trip.id}).sort({date: -1});
    if(postcards){
      for(let j = 0; j < postcards.length; j++){
        let postcard = postcards[j];
        let thumbnails = postcard.thumbnails || [];
        pcObj[postcard.id] = pcObj[postcard.id] = { 
          photos: postcard.photos,
          thumbnails: thumbnails,
          _id: postcard.id,
          title: postcard.title,
          body: postcard.body,
          tripId: postcard.tripId,
          lat: postcard.lat,
          lng: postcard.lng,
          createdAt: postcard.createdAt,
          updatedAt: postcard.updatedAt,
          __v: postcard.__v,
          travellerId: user.id
        };
      }
    }
  }
  res.json({user: userObj, trips: tripsObj, postcards: pcObj})
})

router.put('/:userId/follow', passport.authenticate('jwt', {session: false}), async (req, res) => {
  //takes the userId of the user you want to follow
  const user = await User.findById(req.user.id);
  const followedUser = await User.findById(req.params.userId);
  if(user.following.includes(followedUser.id)){
    return res.status(400).json("Already following that user")
  }

  
  user.following = user.following.concat(req.params.userId);
  user.save()
    .then((user) => {
      res.json(user)
    })
})

router.delete('/:userId/unfollow', passport.authenticate('jwt', {session: false}), async (req, res)=>{
  const user = await User.findById(req.user.id);
  const followedUser = await User.findById(req.params.userId);
  if(!user.following.includes(followedUser.id)){
    return res.status(400).json("Not yet following that user")
  }
  let idx = user.following.indexOf(followedUser.id)
  user.following.splice(idx, 1)
  user.save()
    .then((user)=>{
      res.json(user)
    })
})

router.post("/profile/image", upload.single("image"), passport.authenticate('jwt', {session: false}), async (req, res) => {
  const currentUser = await User.findById(req.user.id);
  if (currentUser.profilePic){
    let imageUrl = currentUser.profilePic;
    let bucket = imageUrl.split("/")[2].split(".")[0];
    let key = imageUrl.split("/")[3];
    deleteImage(bucket, key);
  }
  currentUser.profilePic = req.file.location
  currentUser.save()
    .then((user) => {
      res.json(user)
    })
    .catch((err) => {
      res.status(400).json(err)
    })
})

router.delete("/profile/image", passport.authenticate('jwt', {session: false}), async (req, res) => {
  const currentUser = await User.findById(req.user.id);
  let imageUrl = currentUser.profilePic;
  let bucket = imageUrl.split("/")[2].split(".")[0];
  let key = imageUrl.split("/")[3];

  deleteImage(bucket, key);

  currentUser.profilePic = null;
  currentUser.save()
    .then((user) => {
      res.json(user)
    })
    .catch((err) => {
      res.status(400).json(err)
    })
})

router.get('/follows', passport.authenticate('jwt', {session: false}), async (req, res) => {
  const currentUser = await User.findById(req.user.id);
  let followedUsers = {}
  for(let i = 0; i < currentUser.following.length; i++){
    let followId = currentUser.following[i];
    let followUser = await User.findById(followId);
    followedUsers[followId] = followUser;
  }
  // currentUser.following.forEach(follow=>{
  //   followedUsers[follow.id] = follow
  // })
  res.json({followedUsers: followedUsers})
})



module.exports = router;