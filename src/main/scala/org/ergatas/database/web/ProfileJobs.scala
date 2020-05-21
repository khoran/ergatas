package org.ergatas.database.web

object ProfileJobs extends QProfileJobs("profileJobs") {
  override def as(variable: String) = new QProfileJobs(variable)

}

/**
 * ProfileJobs is a Querydsl bean type
 */
class ProfileJobs {

  var jobCatagoryKey: Integer = _

  var missionaryProfileKey: Integer = _

  var profileJobKey: Integer = _

}

