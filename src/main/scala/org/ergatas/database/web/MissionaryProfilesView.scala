package org.ergatas.database.web

object MissionaryProfilesView extends QMissionaryProfilesView("missionaryProfilesView") {
  override def as(variable: String) = new QMissionaryProfilesView(variable)

}

/**
 * MissionaryProfilesView is a Querydsl bean type
 */
class MissionaryProfilesView {

  var currentSupportPercentage: java.math.BigInteger = _

  var description: String = _

  var location: String = _

  var locationLat: java.lang.Double = _

  var locationLong: java.lang.Double = _

  var missionaryProfileKey: Integer = _

  var organizationKey: Integer = _

  var userKey: Integer = _

}

