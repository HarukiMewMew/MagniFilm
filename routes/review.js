var express = require('express'),
    router = express.Router({mergeParams: true}),
    middleware = require('../middleware'),
    plugin = require('../plugin'),
    Movie = require('../models/movie'),
    helper = require('../helper'),
    User = require('../models/user'),
    Review = require('../models/review');

// Review list
router.get('/list', function(req,res) {
    var foundReviewId = undefined;

    // var pagenumber = 1;
    // if (req.query.page && !isNaN(req.query.page)) {
    //     pagenumber = req.query.page;
    // }
    // const queryOptions = {
    //     page: pagenumber,
    //     sort: { date: 1 },
    //     limit: helper.queryLimit(),
    //     collation: {
    //       locale: 'en',
    //     },
    // };

    Movie.findById(req.params.id).populate('review').exec(function(err, foundMovie) {
        if(err){
            plugin.displayGenericError(req, err);
            res.redirect('back');
        } else {
            if (foundMovie) {
                if(req.isAuthenticated()){
                    foundMovie.review.forEach(function(invreview) {
                        if (invreview.user.id.equals(req.user._id) ) {
                            foundReviewId = invreview._id;
                        }
                    });
                }
                res.render("reviewf/reviews.ejs", {title : 'Reviews for ' + foundMovie.moviename, movie: foundMovie, helper : helper, reviewid : foundReviewId});
            } else {
                res.render("notfound.ejs");
            }
        }
    });
});

// Edit review
router.get('/:reviewid/edit', middleware.checkReviewOwner, function(req,res) {
    Review.findById(req.params.reviewid, function(err, foundReview) {
        if(err){
            plugin.displayGenericError(req, err);
            res.redirect('back');
        } else {
            if (foundReview) {
                res.render("reviewf/editreview.ejs", {title : 'Editing your own review', review: foundReview, movie_id: req.params.id, helper : helper});
            } else {
                res.render("notfound.ejs");
            }
        }
    });
});

router.put('/:reviewid', middleware.checkReviewOwner, function(req,res) {
    req.body.review.reviewdate = new Date(); // Update date too
    Review.findByIdAndUpdate(req.params.reviewid, req.body.review, function(err, updatedReview) {
        if(err){
            plugin.displayGenericError(req, err);
            res.redirect('back');
        } else {
            Movie.findById(req.params.id, function(err, foundMovie) {
                if (err) {
                    plugin.displayGenericError(req, err);
                    res.redirect('back');
                } else {
                    // Modify rating on the movie and add review count
                    if (foundMovie) {
                        var newsumrating = foundMovie.sumrating - updatedReview.rating + parseInt(req.body.review.rating, 10);
                        var newaverage = newsumrating / foundMovie.reviewcount;
                        foundMovie.update({ $set: { avgrating: newaverage, sumrating : newsumrating }}).exec();

                        res.redirect('/movies/' + foundMovie._id + '/reviews/list');
                    } else {
                        plugin.displayDeletedMovieError(req, err);
                        res.redirect('back');
                    }
                }
            });
        }
    });
});

// Delete review by owner
router.delete('/:reviewid', middleware.checkReviewOwner, function(req,res) {
    deleteReview(req,res);
});
// Delete review by manager
router.delete('/:reviewid/foradmin', middleware.checkManager, function(req,res) {
    deleteReview(req,res);
});

function deleteReview(req,res) {
    Review.findById(req.params.reviewid, function(err, foundReview) { // Only used to fetch the rating of the review
        if(err){
            plugin.displayGenericError(req, err);
            res.redirect('back');
        } else {
            var subrating = foundReview.rating;
            Review.findByIdAndRemove(req.params.reviewid, function(err) {
                if(err){
                    plugin.displayGenericError(req, err);
                    res.redirect('back');
                } else {
                    Movie.findById(req.params.id, function(err, foundMovie) {
                        if (err) {
                            plugin.displayGenericError(req, err);
                            res.redirect('back');
                        } else {
                            // Modify rating on the movie and reduce review count
                            if (foundMovie) {
                                var newsumrating = foundMovie.sumrating - subrating;
                                var newreviewcount = foundMovie.reviewcount - 1;
                                if (foundMovie.reviewcount == 1) {
                                    var newaverage = -1;
                                } else {
                                    var newaverage = newsumrating / newreviewcount;
                                }
                                foundMovie.update({ $set: { avgrating: newaverage, reviewcount: newreviewcount, sumrating : newsumrating }}).exec();
            
                                res.redirect('/movies/' + foundMovie._id + '/reviews/list');
                            } else {
                                plugin.displayDeletedMovieError(req, err);
                                res.redirect('back');
                            }
                        }
                    });
                }
            });
        }
    });
}

// New review
router.get('/new', middleware.checkExistingReview, function(req,res) {
    Movie.findById(req.params.id, function(err, foundMovie) {
        if (err) {
            plugin.displayGenericError(req, err);
            res.redirect('back');
        } else {
            if (foundMovie) {
                res.render('reviewf/newreview.ejs', {title : 'Reviewing ' + foundMovie.moviename, movie: foundMovie, helper : helper});
            } else {
                res.render("notfound.ejs");
            }
        }
    });
});

router.post('/', middleware.checkExistingReview, function(req, res) {
    Movie.findById(req.params.id, function(err, foundMovie) {
        if (err) {
            plugin.displayGenericError(req, err);
            res.redirect('/movies' + foundMovie._id + '/reviews/add');
        } else {
            if (foundMovie) {
                req.body.review.user = req.body.user;
                req.body.review.reviewdate = new Date();
                Review.create(req.body.review, function(err, newreview) {
                    if (err) {
                        plugin.displayGenericError(req, err);
                        res.redirect('back');
                    } else {
                        // Add review for both review and movie schemas
                        newreview.user.id = req.user._id;
                        newreview.user.username = req.user.username;
                        newreview.formovie.id = foundMovie._id;
                        newreview.formovie.moviename = foundMovie.moviename;
                        newreview.save();
                        foundMovie.review.push(newreview);
                        foundMovie.save();

                        // Modify rating on the movie and add review count
                        var newsumrating = foundMovie.sumrating + parseInt(newreview.rating, 10);
                        var newreviewcount = foundMovie.reviewcount + 1;
                        var newaverage = newsumrating / newreviewcount;
                        foundMovie.update({ $set: { avgrating: newaverage, reviewcount: newreviewcount, sumrating : newsumrating }}).exec();

                        User.findById(req.user._id, function(err, foundUser) {
                            if (err) {
                                plugin.displayGenericError(req, err);
                                res.redirect('back');
                            } else {
                                var refReview = newreview._id;
                                foundUser.reviewHistory.push(refReview);
                                foundUser.save();
                            res.redirect('/movies/' + foundMovie._id + '/reviews/list');
                            }
                        });

                    }
                });
            } else {
                plugin.displayDeletedMovieError(req, err);
                res.redirect('back');
            }
        }
    });
});

module.exports = router;