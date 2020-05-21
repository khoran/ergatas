package org.ergatas.database.web

object JobCatagories extends QJobCatagories("jobCatagories") {
  override def as(variable: String) = new QJobCatagories(variable)

}

/**
 * JobCatagories is a Querydsl bean type
 */
class JobCatagories {

  var catagory: String = _

  var jobCatagoryKey: Integer = _

  var socGroup: String = _

}

