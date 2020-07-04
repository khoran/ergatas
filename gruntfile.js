module.exports = function(grunt){

    "use strict";

    grunt.initConfig({
    sass: {
      dist: {
        options: {
          style: 'compressed',
          compass: false,
          sourcemap: false
        },
        files: {
          'public/css/styles.min.css': [
              'public/scss/styles.scss'
          ]
        }
      }
    },
    watch: {
      options: {
        livereload: true
      },
      sass: {
        files: [
          'public/scss/**/*.scss'
        ],
        tasks: ['sass']
      },
      html: {
        files: [
          '**/*.html'
        ]
      }
    },
    clean: {
      dist: [
        'public/css/styles.min.css'
    ]
  }
});

  // Load tasks
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-sass');

  // Register tasks
  grunt.registerTask('default', [
    'clean',
    'sass',
  ]);
  grunt.registerTask('dev', [
    'watch'
  ]);

};