package org.ergatas.database.web

object MissionaryProfiles extends QMissionaryProfiles("missionaryProfiles") {
  override def as(variable: String) = new QMissionaryProfiles(variable)

}

/**
 * MissionaryProfiles is a Querydsl bean type
 */
class MissionaryProfiles {

  var currentSupportPercentage: java.math.BigInteger = _

  var description: String = _

  var location: String = _

  var locationLat: java.lang.Double = _

  var locationLong: java.lang.Double = _

  var missionaryProfileKey: Integer = _

  var organizationKey: Integer = _

  var userKey: Integer = _

}

