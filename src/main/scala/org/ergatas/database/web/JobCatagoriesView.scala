package org.ergatas.database.web

object JobCatagoriesView extends QJobCatagoriesView("jobCatagoriesView") {
  override def as(variable: String) = new QJobCatagoriesView(variable)

}

/**
 * JobCatagoriesView is a Querydsl bean type
 */
class JobCatagoriesView {

  var catagory: String = _

  var jobCatagoryKey: Integer = _

  var socGroup: String = _

}

