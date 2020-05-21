package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QMissionaryProfilesUserKeyKey extends QMissionaryProfilesUserKeyKey("missionaryProfilesUserKeyKey") {
  override def as(variable: String) = new QMissionaryProfilesUserKeyKey(variable)

}

class QMissionaryProfilesUserKeyKey(md: PathMetadata[_]) extends RelationalPathImpl[MissionaryProfilesUserKeyKey](md, "web", "missionary_profiles_user_key_key") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

