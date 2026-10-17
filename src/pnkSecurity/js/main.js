$(function() {
  "use strict";

  var nav_offset_top = $('header').height() + 50; 
    /*-------------------------------------------------------------------------------
	  Navbar 
	-------------------------------------------------------------------------------*/

	//* Navbar Fixed  
    function navbarFixed(){
        if ( $('.header_area').length ){ 
            $(window).scroll(function() {
                var scroll = $(window).scrollTop();   
                if (scroll >= nav_offset_top ) {
                    $(".header_area").addClass("navbar_fixed");
                } else {
                    $(".header_area").removeClass("navbar_fixed");
                }
            });
        };
    };
    navbarFixed();





  // VUL030: se retiraron mailchimp (ajaxChimp) y el popup de video
  // (Magnific Popup): no se usaban y eran librerias obsoletas.

    /*-------------------------------------------------------------------------------
	  featured slider
	-------------------------------------------------------------------------------*/
    if ($('.featured-carousel').length) {
        $('.featured-carousel').owlCarousel({
            loop: false,
            margin: 30,
            items: 1,
            nav: true,
            dots: false,
            responsiveClass: true,
            slideSpeed: 300,
            paginationSpeed: 500,
            navText : ["<div class='left-arrow'><i class='ti-angle-left'></i></div>","<div class='right-arrow'><i class='ti-angle-right'></i></div>"],
            responsive: {
                768: {
                    items: 2
                },
                1100: {
                    items: 3
                }
            }
        })
    }



    /*-------------------------------------------------------------------------------
	  featured slider
	-------------------------------------------------------------------------------*/
    if ($('.hero-carousel').length) {
        $('.hero-carousel').owlCarousel({
            loop: false,
            margin: 30,
            items: 1,
            nav: false,
            dots: true,
            responsiveClass: true,
            slideSpeed: 300,
            paginationSpeed: 500
        })
    }



  
});


