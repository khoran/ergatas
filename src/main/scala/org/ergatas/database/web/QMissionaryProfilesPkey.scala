package org.ergatas.database.web

import com.mysema.query.types._
import com.mysema.query.scala._

import com.mysema.query.types.PathMetadataFactory._;

import com.mysema.query.scala.sql.RelationalPathImpl

import com.mysema.query.sql._

object QMissionaryProfilesPkey extends QMissionaryProfilesPkey("missionaryProfilesPkey") {
  override def as(variable: String) = new QMissionaryProfilesPkey(variable)

}

class QMissionaryProfilesPkey(md: PathMetadata[_]) extends RelationalPathImpl[MissionaryProfilesPkey](md, "web", "missionary_profiles_pkey") {
  def this(variable: String) = this(forVariable(variable))

  def this(parent: Path[_], property: String) = this(forProperty(parent, property))

}

