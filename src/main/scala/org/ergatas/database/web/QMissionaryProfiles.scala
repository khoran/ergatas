package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QMissionaryProfiles extends QMissionaryProfiles("missionaryProfiles") {
  override def as(variable: String) = new QMissionaryProfiles(variable)

}

class QMissionaryProfiles(md: PathMetadata[_]) extends RelationalPathImpl[MissionaryProfiles](md, "web", "missionary_profiles") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

  val currentSupportPercentage = createNumber[java.math.BigInteger]("currentSupportPercentage")

  val description = createString("description")

  val location = createString("location")

  val locationLat = createNumber[Double]("locationLat")

  val locationLong = createNumber[Double]("locationLong")

  val missionaryProfileKey = createNumber[Int]("missionaryProfileKey")

  val organizationKey = createNumber[Int]("organizationKey")

  val userKey = createNumber[Int]("userKey")

  val missionaryProfilesPkey: PrimaryKey[MissionaryProfiles] = createPrimaryKey(missionaryProfileKey)

  val missionaryProfilesUserKeyFkey: ForeignKey[Users] = createForeignKey(userKey, "user_key")

  val missionaryProfilesOrganizationKeyFkey: ForeignKey[Organizations] = createForeignKey(organizationKey, "organization_key")

  val _profileJobsMissionaryProfileKeyFkey: ForeignKey[ProfileJobs] = createInvForeignKey(missionaryProfileKey, "missionary_profile_key")

  addMetadata(currentSupportPercentage, ColumnMetadata.named("current_support_percentage").ofType(2).withSize(131089))
  addMetadata(description, ColumnMetadata.named("description").ofType(12).withSize(2147483647))
  addMetadata(location, ColumnMetadata.named("location").ofType(12).withSize(2147483647))
  addMetadata(locationLat, ColumnMetadata.named("location_lat").ofType(8).withSize(17).withDigits(17).notNull())
  addMetadata(locationLong, ColumnMetadata.named("location_long").ofType(8).withSize(17).withDigits(17).notNull())
  addMetadata(missionaryProfileKey, ColumnMetadata.named("missionary_profile_key").ofType(4).withSize(10).notNull())
  addMetadata(organizationKey, ColumnMetadata.named("organization_key").ofType(4).withSize(10).notNull())
  addMetadata(userKey, ColumnMetadata.named("user_key").ofType(4).withSize(10))
}

