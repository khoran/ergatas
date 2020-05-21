package org.ergatas.database.web

object ProfileJobsView extends QProfileJobsView("profileJobsView") {
  override def as(variable: String) = new QProfileJobsView(variable)

}

/**
 * ProfileJobsView is a Querydsl bean type
 */
class ProfileJobsView {

  var jobCatagoryKey: Integer = _

  var missionaryProfileKey: Integer = _

  var profileJobKey: Integer = _

}

