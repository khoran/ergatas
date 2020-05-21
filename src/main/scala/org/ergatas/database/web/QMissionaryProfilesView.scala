package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QMissionaryProfilesView extends QMissionaryProfilesView("missionaryProfilesView") {
  override def as(variable: String) = new QMissionaryProfilesView(variable)

}

class QMissionaryProfilesView(md: PathMetadata[_]) extends RelationalPathImpl[MissionaryProfilesView](md, "web", "missionary_profiles_view") {
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

  addMetadata(currentSupportPercentage, ColumnMetadata.named("current_support_percentage").ofType(2).withSize(131089))
  addMetadata(description, ColumnMetadata.named("description").ofType(12).withSize(2147483647))
  addMetadata(location, ColumnMetadata.named("location").ofType(12).withSize(2147483647))
  addMetadata(locationLat, ColumnMetadata.named("location_lat").ofType(8).withSize(17).withDigits(17))
  addMetadata(locationLong, ColumnMetadata.named("location_long").ofType(8).withSize(17).withDigits(17))
  addMetadata(missionaryProfileKey, ColumnMetadata.named("missionary_profile_key").ofType(4).withSize(10))
  addMetadata(organizationKey, ColumnMetadata.named("organization_key").ofType(4).withSize(10))
  addMetadata(userKey, ColumnMetadata.named("user_key").ofType(4).withSize(10))
}

