package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QMissionaryProfilesMissionaryProfileKeySeq extends QMissionaryProfilesMissionaryProfileKeySeq("missionaryProfilesMissionaryProfileKeySeq") {
  override def as(variable: String) = new QMissionaryProfilesMissionaryProfileKeySeq(variable)

}

class QMissionaryProfilesMissionaryProfileKeySeq(md: PathMetadata[_]) extends RelationalPathImpl[MissionaryProfilesMissionaryProfileKeySeq](md, "web", "missionary_profiles_missionary_profile_key_seq") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

